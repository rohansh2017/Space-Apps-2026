import { OrbitControls } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Site } from './data'
import { loadHeightmap } from './data'
import type { Angles } from './engine/engine'
import { SUN_RADIUS_DEG, maskAt } from './engine/engine'
import type { GridStats } from './moon'
import type { Layer } from './MoonView'
import { BAD, Numbers, OK } from './MoonView'
import { EARTH_RAMP, SUN_RAMP, colour } from './ramp'
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
// One repeat of the illustrative regolith texture. Its largest bump or crater is about 1.5 m across, below what even
// the 5 m DEM resolves, so it adds texture under the real relief and never invents a feature the data would show.
const DETAIL_TILE_M = 12
const MESH_N = 384 // terrain mesh quads per side
const RING_BAND_M = 220 // lit band below the crest line on the ring (about 2 deg at 6 km)
const RING_ALBEDO = 0.5
// Display aid, not light: when the Sun is hidden from the observer the scene would be black (lunar shadow is),
// so a faint fill from overhead keeps the ground's relief and the skyline readable. It fades in with the hidden
// share of the solar disk, is named in the footer and tagged in the view, and never feeds a number.
const SHADOW_FILL = 0.3
const RING_SHADOW_FILL = 0.05
const RING_TEX_U = 240 // texture repeats around the ring
const RING_TEX_V_M = 300 // ring metres per texture repeat, vertically
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
  ridges: Int8Array | null // horizon-crest normals (360 x 3, x 127) in the site's east/north/up axes
  stars: Float32Array // catalogue rows: ICRF unit vector, V magnitude, B-V
  dots: GroundDot[] | null // the 500 m search grid (D74); null = hidden
  grid: GridStats | null // the engine's per-point results that colour the dots
  layer: Layer // Verdict, Sunlight or Earth, as on the Moon view
  here: number | null // the observer's own grid index (not drawn: it is underfoot)
  onDot: ((index: number) => void) | null // stand on a dot; null while an alternative is on show
}

/** A grid point in the scene's site-centred metres; `up` is its LOLA height above the observer's ground. */
export interface GroundDot {
  index: number
  east: number
  north: number
  up: number
  lat: number
  lon: number
}
interface OnScreen { index: number; x: number; y: number; r: number }

/** Dots within this many pixels of the pointer can be hovered or clicked. */
const HIT_PX = 5
const v = new THREE.Vector3() // scratch for projecting dots
/** The dot nearest the pointer, or null; overlapping dots go to the one nearer the camera (drawn last, on top). */
function hit(screen: OnScreen[], x: number, y: number): OnScreen | null {
  let best: OnScreen | null = null
  for (const d of screen) if (Math.hypot(d.x - x, d.y - y) <= d.r + HIT_PX) best = d
  return best
}

/** Repaints the dots' 2D canvas after every frame, with the frame's camera (D74). */
function DotLayer({ paint }: { paint: (camera: THREE.Camera, size: { width: number; height: number }) => void }) {
  useFrame(({ camera, size }) => paint(camera, size))
  return null
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
function Scene3D({ site, east, north, mask, track, t, sunFraction, earthDistKm, sky, stars, ridges, dots, grid, layer, here, onDot }: Props) {
  // grid dots (D74): their screen positions from the last frame, the hovered one, and where a press started
  const dotCanvas = useRef<HTMLCanvasElement>(null)
  const onScreen = useRef<OnScreen[]>([])
  const pressedAt = useRef<[number, number] | null>(null)
  const [hover, setHover] = useState<{ index: number; x: number; y: number; up: boolean } | null>(null)
  const showDots = Boolean(dots && grid)
  /**
   * The search grid's dots over the 3D view (D74), drawn like the Moon view's: Verdict is solid green (meets every
   * constraint) or a hollow red ring, Sunlight and Earth fill each dot from the engine's per-point %. Projected every
   * frame onto a 2D canvas, far dots first, sized by distance, and drawn through hills so every dot stays in reach.
   */
  const hoverIndex = hover?.index ?? null
  const paintDots = useCallback((camera: THREE.Camera, size: { width: number; height: number }) => {
    if (!dots || !grid) return
    const cv = dotCanvas.current
    if (!cv) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const [w, h] = [Math.round(size.width * dpr), Math.round(size.height * dpr)]
    if (cv.width !== w || cv.height !== h) [cv.width, cv.height] = [w, h]
    const g = cv.getContext('2d')!
    g.setTransform(dpr, 0, 0, dpr, 0, 0)
    g.clearRect(0, 0, size.width, size.height)
    const out: OnScreen[] = []
    const far = dots.map((d) => ({ d, dist: v.set(d.east, d.up, -d.north).distanceTo(camera.position) })).sort((a, b) => b.dist - a.dist)
    for (const { d, dist } of far) {
      if (d.index === here) continue
      v.set(d.east, d.up, -d.north).project(camera)
      if (v.z < -1 || v.z > 1 || Math.abs(v.x) > 1.02 || Math.abs(v.y) > 1.02) continue // behind the camera or off screen
      const [x, y] = [(v.x * 0.5 + 0.5) * size.width, (0.5 - v.y * 0.5) * size.height]
      const r = Math.min(10, Math.max(4, 5000 / dist)) // 10 px at 500 m, 4 px from 1.25 km
      const verdict = grid.verdicts[d.index]
      g.beginPath()
      g.arc(x, y, r, 0, 2 * Math.PI)
      g.lineWidth = Math.max(1.2, r * 0.3) + 1.5 // a dark halo keeps dots readable on sunlit ground
      g.strokeStyle = 'rgb(5 6 8 / 55%)'
      g.stroke()
      if (layer !== 'verdict') {
        g.fillStyle = layer === 'sun' ? colour(grid.sun[d.index], 100, SUN_RAMP) : colour(grid.earth[d.index], 100, EARTH_RAMP)
        g.fill()
      } else if (verdict && verdict.evaluation.fails === 0) {
        g.fillStyle = OK
        g.fill()
      } else {
        // pass = solid, fail = hollow: the shape carries it, not only the colour
        g.lineWidth = Math.max(1.2, r * 0.3)
        g.strokeStyle = verdict ? BAD : 'rgb(236 232 225 / 40%)'
        g.stroke()
      }
      if (d.index === hoverIndex) {
        g.beginPath()
        g.arc(x, y, r + 3, 0, 2 * Math.PI)
        g.lineWidth = 1.5
        g.strokeStyle = '#ece8e1'
        g.stroke()
      }
      out.push({ index: d.index, x, y, r })
    }
    onScreen.current = out
    // for the browser tests: how many dots are drawn, and the nearest one in the middle of the view
    cv.dataset.count = String(out.length)
    const mid = out.filter((d) => Math.abs(d.x - size.width / 2) < size.width * 0.3 && Math.abs(d.y - size.height / 2) < size.height * 0.3)
    cv.dataset.sample = mid.length ? `${mid[mid.length - 1].index},${mid[mid.length - 1].x.toFixed(0)},${mid[mid.length - 1].y.toFixed(0)}` : ''
  }, [dots, grid, layer, here, hoverIndex])
  const local = (e: React.PointerEvent | React.MouseEvent) => {
    const b = e.currentTarget.getBoundingClientRect()
    return [e.clientX - b.left, e.clientY - b.top, b.height] as const
  }
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

  // Far-field silhouette: a wall around the observer whose top edge is the horizon mask. Its shading is set per
  // hour below from the real crest slopes (ridges), so ranges facing the Sun light up and others stay dark.
  const ring = useMemo(() => {
    const g = new THREE.BufferGeometry()
    const v: number[] = []
    const uv: number[] = []
    for (let az = 0; az <= 360; az++) {
      const [x, z] = [RING_M * Math.sin(az * RAD), -RING_M * Math.cos(az * RAD)]
      const top = RING_M * Math.tan((mask ? maskAt(mask, az) : 0) * RAD)
      v.push(x, top, z, x, top - RING_BAND_M, z, x, -3000, z)
      const u = (az / 360) * RING_TEX_U
      uv.push(u, 0, u, RING_BAND_M / RING_TEX_V_M, u, (top + 3000) / RING_TEX_V_M)
    }
    const idx: number[] = []
    for (let i = 0; i < 360; i++)
      for (const r of [0, 1]) idx.push(3 * i + r, 3 * i + r + 1, 3 * i + r + 3, 3 * i + r + 1, 3 * i + r + 4, 3 * i + r + 3)
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
    g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(361 * 9), 3))
    g.setIndex(idx)
    return g
  }, [mask])
  const ringMaterial = useMemo(() => {
    const map = regolith().map.clone() // illustrative rock texture; the lighting on it comes from the data
    map.needsUpdate = true
    return new THREE.MeshBasicMaterial({ vertexColors: true, map, side: THREE.DoubleSide })
  }, [])

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
  const sunTrail = useTrail(track, (a) => [a.sunAz, a.sunEl], '#f0b955')
  const earthTrail = useTrail(track, (a) => [a.earthAz, a.earthEl], '#5fa8ff')
  sunTrail.geometry.setDrawRange(0, t + 1)
  earthTrail.geometry.setDrawRange(0, t + 1)
  // Display exposure, not photometry. At the pole a slope facing the Sun gets ~10x the light of flat ground, so no
  // linear exposure shows both: flat ground lands at ~15-25% grey and the ACES tone curve rolls sunward slopes off
  // instead of clipping them to white.
  const exposure = 0.6 / Math.sin((Math.max(now.sunEl, 0.5) + 3) * RAD)
  // Light the ring from the crest normals and the real Sun, independent of whether the observer is lit: distant
  // peaks can be in sunshine while you stand in shadow. Cast shadows onto the crests themselves are not modelled.
  {
    const col = ring.attributes.color as THREE.BufferAttribute
    const [se, sn, su] = [Math.sin(now.sunAz * RAD) * Math.cos(now.sunEl * RAD), Math.cos(now.sunAz * RAD) * Math.cos(now.sunEl * RAD), Math.sin(now.sunEl * RAD)]
    const facing = (bin: number) => {
      const k = (((bin % 360) + 360) % 360) * 3
      return ridges ? Math.max(0, (ridges[k] * se + ridges[k + 1] * sn + ridges[k + 2] * su) / 127) : 0.02
    }
    for (let az = 0; az <= 360; az++) {
      // each bin's normal is one DEM-gradient sample at one crest point: smooth over +-2 deg so it reads as ranges, not a barcode
      const b = (facing(az - 2) + 2 * facing(az - 1) + 3 * facing(az) + 2 * facing(az + 1) + facing(az + 2)) / 9
      const lit = 0.008 + RING_SHADOW_FILL * (1 - sunFraction) + RING_ALBEDO * exposure * b
      col.setXYZ(3 * az, lit, lit, lit * 1.03)
      col.setXYZ(3 * az + 1, lit * 0.45, lit * 0.45, lit * 0.47)
      col.setXYZ(3 * az + 2, 0.004, 0.004, 0.005)
    }
    col.needsUpdate = true
  }
  return (
    <>
    <Canvas className="scene" shadows camera={{ near: 0.5, far: 30000, fov: 60 }}
      style={hover && onDot ? { cursor: 'pointer' } : undefined}
      onPointerDown={(e) => { pressedAt.current = [e.clientX, e.clientY] }}
      onPointerMove={(e) => {
        if (!showDots || e.buttons) return setHover(null)
        const [x, y, h] = local(e)
        const d = hit(onScreen.current, x, y)
        setHover((o) => (d ? (o?.index === d.index ? o : { index: d.index, x: d.x, y: d.y, up: d.y > h / 2 }) : null))
      }}
      onPointerLeave={() => setHover(null)}
      onClick={(e) => {
        // a click, not a look-around drag, on a dot stands there
        const p = pressedAt.current
        if (!showDots || !onDot || !p || Math.hypot(e.clientX - p[0], e.clientY - p[1]) > 5) return
        const d = hit(onScreen.current, ...local(e).slice(0, 2) as [number, number])
        if (d) onDot(d.index)
      }}>
      <color attach="background" args={['#000']} />
      <Camera eye={eye} look={look} />
      <ambientLight intensity={0.05} />
      <directionalLight position={[0, 5000, 0]} intensity={SHADOW_FILL * (1 - sunFraction)} />
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
        <mesh geometry={ring} material={ringMaterial} />
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
        <mesh key="patch" geometry={geometry} material={soil} rotation={[-Math.PI / 2, 0, 0]} position={[0, -ground, 0]} castShadow receiveShadow />
      ) : (
        // shortcut: heightmaps cover 5 x 5 km around each curated site; farther grid points get level ground (the ring is still exact). Upgrade by exporting a heightmap per opened point.
        // The keys keep React from reusing one mesh object for both branches (its geometry prop would go stale).
        <mesh key="level" geometry={level} material={soil} rotation={[-Math.PI / 2, 0, 0]} position={[east, 0, -north]} />
      )}
      {showDots && <DotLayer paint={paintDots} />}
    </Canvas>
    {showDots && <canvas ref={dotCanvas} className="ground-dots" data-testid="ground-dots" aria-hidden="true" />}
    {showDots && hover && (() => {
      const d = dots!.find((p) => p.index === hover.index)
      const v = grid!.verdicts[hover.index]
      return d && v && (
        <div className={hover.up ? 'moon-tip dot up' : 'moon-tip dot'} style={{ left: hover.x, top: hover.y, pointerEvents: 'none' }} data-testid="ground-dot-tip">
          <strong>{d.lat.toFixed(4)}°, {d.lon.toFixed(3)}°E · {(Math.hypot(d.east - east, d.north - north) / 1000).toFixed(1)} km away</strong>
          <Numbers v={v} />
          {onDot && <span className="dim">Click to stand here</span>}
        </div>
      )
    })()}
    </>
  )
}

export default memo(Scene3D)
