import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { memo, useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { Site } from './data'
import { loadHeightmap } from './data'
import type { Angles } from './engine/engine'
import { SUN_RADIUS_DEG, maskAt } from './engine/engine'
import { regolith } from './regolith'
import { sceneMatrix, starField } from './starfield'

const RAD = Math.PI / 180
const EYE_M = 2
const RING_M = 6000 // beyond the far corner of the 5 km patch from any point we can stand on
const SUN_M = 8000 // bodies sit behind the ring, so the ring hides them exactly when the mask does
const EARTH_M = 9000
const TRAIL_M = 9500
const STAR_M = 20000
const EARTH_RADIUS_KM = 6371
const DETAIL_TILE_M = 12 // one repeat of the illustrative regolith texture
const MESH_N = 384 // terrain mesh quads per side
const WARP_A = 0.25 // share of linear spacing in the mesh warp: smaller = finer near the observer

/** Unit vector for an azimuth/elevation in scene axes: x east, y up, -z north. */
const direction = (az: number, el: number) =>
  new THREE.Vector3(Math.sin(az * RAD) * Math.cos(el * RAD), Math.sin(el * RAD), -Math.cos(az * RAD) * Math.cos(el * RAD))

interface Props {
  site: Site
  east: number // observer offset from the site centre, metres
  north: number
  mask: Uint16Array | null // the observer's own horizon mask
  track: Angles[] // hourly Sun and Earth angles from the landing hour
  t: number // current hour within the track
  sunFraction: number // from the engine; the renderer never decides visibility
  earthDistKm: number
  sky: number[] // ICRF -> local east/north/up at this hour (engine skyMatrix)
  stars: Float32Array // catalogue rows: ICRF unit vector, V magnitude, B-V
}

function Camera({ eye, look }: { eye: THREE.Vector3; look: THREE.Vector3 }) {
  const camera = useThree((s) => s.camera)
  useEffect(() => {
    camera.position.copy(eye)
    camera.lookAt(look)
  }, [camera, eye, look])
  // orbiting a target 1 cm ahead of the eye is a look-around; negative speed makes drag feel natural
  return <OrbitControls target={look} enableZoom={false} enablePan={false} rotateSpeed={-0.4} />
}

/** Soft glare around the Sun (a camera effect; the Moon has no sky glow). */
const glare = (() => {
  const n = 128
  const px = new Uint8ClampedArray(n * n * 4)
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const d = Math.hypot(x - n / 2 + 0.5, y - n / 2 + 0.5) / (n / 2)
      const a = Math.max(0, 1 - d) ** 3
      px.set([255, 244, 214, a * 255], (y * n + x) * 4)
    }
  const t = new THREE.DataTexture(px, n, n, THREE.RGBAFormat)
  t.magFilter = THREE.LinearFilter
  t.needsUpdate = true
  return t
})()

// Earth as a lit sphere: the phase follows the real Sun direction. Oceans, land and cloud are illustrative.
const earthMaterial = new THREE.ShaderMaterial({
  uniforms: { sunDir: { value: new THREE.Vector3(1, 0, 0) } },
  vertexShader: 'varying vec3 n; varying vec3 p; void main() { n = normalize(mat3(modelMatrix) * normal); p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform vec3 sunDir; varying vec3 n; varying vec3 p;
    void main() {
      vec3 q = normalize(p);
      float land = smoothstep(0.15, 0.4, sin(q.x * 6.0 + sin(q.y * 4.0) * 2.0) * sin(q.y * 7.0 + q.z * 3.0));
      float cloud = smoothstep(0.55, 0.9, sin(q.y * 13.0 + sin(q.x * 5.0 + q.z * 4.0) * 3.0) * 0.5 + 0.5);
      vec3 c = mix(mix(vec3(0.07, 0.22, 0.55), vec3(0.22, 0.36, 0.2), land), vec3(0.95), cloud * 0.8);
      float lit = smoothstep(-0.03, 0.18, dot(normalize(n), sunDir));
      gl_FragColor = vec4(c * (0.02 + lit * 1.15), 1.0);
      #include <colorspace_fragment>
    }`,
})

/** A line through `track` on the sky sphere; only the part up to the current hour is drawn. */
function useTrail(track: Angles[], pick: (a: Angles) => [number, number], colour: string) {
  return useMemo(() => {
    const v: number[] = []
    for (const a of track) v.push(...direction(...pick(a)).multiplyScalar(TRAIL_M).toArray())
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    return new THREE.Line(g, new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity: 0.75 }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track])
}

/** First-person view from 2 m above the terrain, in local metric coordinates centred on the site. */
function Scene3D({ site, east, north, mask, track, t, sunFraction, earthDistKm, sky, stars }: Props) {
  const hm = site.heightmap!
  const [loaded, setLoaded] = useState<{ file: string; heights: Uint16Array } | null>(null)
  useEffect(() => {
    let live = true
    loadHeightmap(hm.file, hm.size_px).then((heights) => live && setLoaded({ file: hm.file, heights }), console.error)
    return () => {
      live = false
    }
  }, [hm.file, hm.size_px])
  const heights = loaded?.file === hm.file ? loaded.heights : null

  const n = hm.size_px
  const cell = hm.span_m / (n - 1)
  const onPatch = Math.max(Math.abs(east), Math.abs(north)) < hm.span_m / 2 - cell

  // Terrain mesh: MESH_N x MESH_N quads whose spacing grows away from the observer, sampled bilinearly from
  // the heightmap. About 3 m spacing where you stand and about 30 m at the patch edge, at ~150k vertices,
  // so a 1024 px (5 m) heightmap does not need a million-vertex mesh. Rebuilt when the observer moves.
  const geometry = useMemo(() => {
    if (!heights) return null
    const half = hm.span_m / 2
    const at = (x: number, y: number) => {
      const col = Math.min(n - 1.001, Math.max(0, (x + half) / cell))
      const row = Math.min(n - 1.001, Math.max(0, (half - y) / cell))
      const [c0, r0] = [Math.floor(col), Math.floor(row)]
      const [fc, fr] = [col - c0, row - r0]
      const h = (r: number, c: number) => heights[r * n + c] * hm.scale_m
      return (h(r0, c0) * (1 - fc) + h(r0, c0 + 1) * fc) * (1 - fr) + (h(r0 + 1, c0) * (1 - fc) + h(r0 + 1, c0 + 1) * fc) * fr
    }
    // u in [-1, 1] -> coordinate in [-half, half], with u = 0 at the observer and fine steps near it
    const warp = (u: number, c: number) => {
      const g = (s: number) => WARP_A * s + (1 - WARP_A) * s * s * s
      return u >= 0 ? c + (half - c) * g(u) : c - (half + c) * g(-u)
    }
    const [ce, cn] = [Math.max(-half, Math.min(half, east)), Math.max(-half, Math.min(half, north))]
    const g = new THREE.PlaneGeometry(hm.span_m, hm.span_m, MESH_N, MESH_N)
    const [pos, uv] = [g.attributes.position, g.attributes.uv]
    for (let i = 0; i < pos.count; i++) {
      const x = warp(pos.getX(i) / half, ce)
      const y = warp(pos.getY(i) / half, cn)
      // plane x = east, plane y = north (rows run north to south like the heightmap); z becomes up after the rotation
      pos.setXYZ(i, x, y, at(x, y))
      uv.setXY(i, x / hm.span_m + 0.5, y / hm.span_m + 0.5) // soil detail keeps its size on the warped grid
    }
    g.computeVertexNormals()
    return g
  }, [heights, hm.span_m, hm.scale_m, n, cell, east, north])

  // ground height under the observer, bilinear on the mesh grid (same units as the mesh z)
  const ground = useMemo(() => {
    if (!heights || !onPatch) return 0
    const col = (east + hm.span_m / 2) / cell
    const row = (hm.span_m / 2 - north) / cell
    const [c0, r0] = [Math.floor(col), Math.floor(row)]
    const [fc, fr] = [col - c0, row - r0]
    const h = (r: number, c: number) => heights[r * n + c] * hm.scale_m
    return (h(r0, c0) * (1 - fc) + h(r0, c0 + 1) * fc) * (1 - fr) + (h(r0 + 1, c0) * (1 - fc) + h(r0 + 1, c0 + 1) * fc) * fr
  }, [heights, onPatch, east, north, cell, n, hm.span_m, hm.scale_m])

  // far-field silhouette: a wall around the observer whose top edge is the horizon mask
  const ring = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const v: number[] = []
    const c: number[] = []
    for (let az = 0; az <= 360; az++) {
      const [x, z] = [RING_M * Math.sin(az * RAD), -RING_M * Math.cos(az * RAD)]
      const top = RING_M * Math.tan((mask ? maskAt(mask, az) : 0) * RAD)
      v.push(x, top, z, x, top - 220, z, x, -3000, z)
      c.push(0.13, 0.13, 0.145, 0.035, 0.035, 0.04, 0.01, 0.01, 0.012) // a little light along the ridge line, black below
    }
    const idx: number[] = []
    for (let i = 0; i < 360; i++)
      for (const r of [0, 1]) idx.push(3 * i + r, 3 * i + r + 1, 3 * i + r + 3, 3 * i + r + 1, 3 * i + r + 4, 3 * i + r + 3)
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(c, 3))
    g.setIndex(idx)
    return g
  }, [mask])

  // 5 m terrain carries its own relief; the procedural soil is only for coarser patches and level ground
  const realRelief = hm.res_m <= 5
  const bare = useMemo(() => new THREE.MeshStandardMaterial({ color: '#9a958e', roughness: 1, metalness: 0 }), [])
  const starGroup = useMemo(() => starField(stars, STAR_M), [stars])
  sceneMatrix(sky, starGroup.matrix)
  starGroup.matrixWorldNeedsUpdate = true

  const soil = useMemo(() => {
    const { normalMap, map } = regolith()
    const [nm, m] = [normalMap.clone(), map.clone()]
    const repeat = hm.span_m / DETAIL_TILE_M
    nm.repeat.set(repeat, repeat)
    m.repeat.set(repeat / 7.3, repeat / 7.3) // a second scale, so the tiling does not show
    nm.needsUpdate = m.needsUpdate = true
    return new THREE.MeshStandardMaterial({ map: m, normalMap: nm, normalScale: new THREE.Vector2(0.22, 0.22), roughness: 1, metalness: 0 })
  }, [hm.span_m])
  // Level ground for points off the heightmap. The grid is warped so cells are small near the observer:
  // texture coordinates lose precision across very large triangles that cross the camera plane.
  const level = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 2, 200, 200)
    const [pos, uv] = [g.attributes.position, g.attributes.uv]
    for (let i = 0; i < pos.count; i++) {
      const [x, y] = [RING_M * pos.getX(i) ** 3, RING_M * pos.getY(i) ** 3]
      pos.setXY(i, x, y)
      uv.setXY(i, x / hm.span_m, y / hm.span_m) // same soil detail size as on the patch
    }
    return g
  }, [hm.span_m])

  const now = track[t]
  const eye = useMemo(() => new THREE.Vector3(east, EYE_M, -north), [east, north])
  // look a little left of the Sun when the observer changes (the Sun clears the HUD), not on every time step
  const look = useMemo(
    () => eye.clone().add(direction(track[0].sunAz - 30, 0).multiplyScalar(0.01)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eye],
  )
  const sun = direction(now.sunAz, now.sunEl)
  const earth = direction(now.earthAz, now.earthEl)
  earthMaterial.uniforms.sunDir.value.copy(sun)
  // keep the soil's contrast about constant: a given tilt matters more the lower the Sun is
  soil.normalScale.setScalar(0.055 * Math.min(4, Math.max(now.sunEl, 0.4)))
  const sunTrail = useTrail(track, (a) => [a.sunAz, a.sunEl], '#f2c94c')
  const earthTrail = useTrail(track, (a) => [a.earthAz, a.earthEl], '#6da7ec')
  sunTrail.geometry.setDrawRange(0, t + 1)
  earthTrail.geometry.setDrawRange(0, t + 1)
  // Display exposure, not photometry. At the pole a slope facing the Sun gets ~10x the light of flat ground, so no
  // linear exposure shows both: flat ground lands at ~15-25% grey and the ACES tone curve rolls sunward slopes off
  // instead of clipping them to white.
  const exposure = 0.6 / Math.sin((Math.max(now.sunEl, 0.5) + 3) * RAD)
  return (
    <Canvas className="scene" shadows camera={{ near: 0.5, far: 30000, fov: 60 }}>
      <color attach="background" args={['#000']} />
      <Camera eye={eye} look={look} />
      <ambientLight intensity={0.05} />
      <directionalLight
        position={sun.clone().multiplyScalar(5000)}
        intensity={exposure * sunFraction}
        color="#fff4e0"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-normalBias={3}
        shadow-camera-left={-3600}
        shadow-camera-right={3600}
        shadow-camera-top={1500}
        shadow-camera-bottom={-1500}
        shadow-camera-near={100}
        shadow-camera-far={10000}
      />
      <group position={eye}>
        <primitive object={starGroup} />
        <primitive object={sunTrail} />
        <primitive object={earthTrail} />
        <mesh geometry={ring}>
          <meshBasicMaterial vertexColors side={THREE.DoubleSide} />
        </mesh>
        <mesh position={sun.clone().multiplyScalar(SUN_M)}>
          <sphereGeometry args={[SUN_M * Math.tan(SUN_RADIUS_DEG * RAD), 24, 24]} />
          <meshBasicMaterial color="#fffbe8" toneMapped={false} />
        </mesh>
        <sprite position={sun.clone().multiplyScalar(SUN_M - 50)} scale={SUN_M * Math.tan(4 * RAD) * 2}>
          <spriteMaterial map={glare} blending={THREE.AdditiveBlending} depthWrite={false} opacity={0.9} toneMapped={false} />
        </sprite>
        <mesh position={earth.clone().multiplyScalar(EARTH_M)} material={earthMaterial}>
          <sphereGeometry args={[EARTH_M * Math.tan(Math.asin(EARTH_RADIUS_KM / earthDistKm)), 32, 32]} />
        </mesh>
      </group>
      {geometry && onPatch ? (
        <mesh key="patch" geometry={geometry} material={realRelief ? bare : soil} rotation={[-Math.PI / 2, 0, 0]} position={[0, -ground, 0]} castShadow receiveShadow />
      ) : (
        // shortcut: heightmaps cover 5 x 5 km around each curated site; farther grid points get level ground (the ring is still exact). Upgrade by exporting a heightmap per opened point.
        // The keys keep React from reusing one mesh object for both branches (its geometry prop would go stale).
        <mesh key="level" geometry={level} material={soil} rotation={[-Math.PI / 2, 0, 0]} position={[east, 0, -north]} />
      )}
    </Canvas>
  )
}

export default memo(Scene3D)
