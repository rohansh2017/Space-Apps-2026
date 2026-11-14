import { OrbitControls } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { Site } from './data'
import { loadHeightmap } from './data'
import { SUN_RADIUS_DEG, maskAt } from './engine/engine'

const RAD = Math.PI / 180
const EYE_M = 2
const RING_M = 6000 // beyond the far corner of the 5 km patch from any point we can stand on
const SUN_M = 8000 // bodies sit behind the ring, so the ring hides them exactly when the mask does
const EARTH_M = 9000
const EARTH_RADIUS_KM = 6371

/** Unit vector for an azimuth/elevation in scene axes: x east, y up, -z north. */
const direction = (az: number, el: number) =>
  new THREE.Vector3(Math.sin(az * RAD) * Math.cos(el * RAD), Math.sin(el * RAD), -Math.cos(az * RAD) * Math.cos(el * RAD))

interface Props {
  site: Site
  east: number // observer offset from the site centre, metres
  north: number
  mask: Uint16Array | null // the observer's own horizon mask
  sunAz: number
  sunEl: number
  sunFraction: number // from the engine; the renderer never decides visibility
  earthAz: number
  earthEl: number
  earthDistKm: number
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

/** First-person view from 2 m above the terrain, in local metric coordinates centred on the site. */
export default function Scene3D({ site, east, north, mask, sunAz, sunEl, sunFraction, earthAz, earthEl, earthDistKm }: Props) {
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

  const geometry = useMemo(() => {
    if (!heights) return null
    const g = new THREE.PlaneGeometry(hm.span_m, hm.span_m, n - 1, n - 1)
    const pos = g.attributes.position
    // plane rows run north to south like the heightmap; z becomes "up" after the mesh rotation
    for (let i = 0; i < pos.count; i++) pos.setZ(i, heights[i] * hm.scale_m)
    g.computeVertexNormals()
    return g
  }, [heights, hm.span_m, hm.scale_m, n])

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
    for (let az = 0; az <= 360; az++) {
      const [x, z] = [RING_M * Math.sin(az * RAD), -RING_M * Math.cos(az * RAD)]
      v.push(x, RING_M * Math.tan((mask ? maskAt(mask, az) : 0) * RAD), z, x, -3000, z)
    }
    const idx: number[] = []
    for (let i = 0; i < 360; i++) idx.push(2 * i, 2 * i + 1, 2 * i + 2, 2 * i + 1, 2 * i + 3, 2 * i + 2)
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3))
    g.setIndex(idx)
    return g
  }, [mask])

  const eye = useMemo(() => new THREE.Vector3(east, EYE_M, -north), [east, north])
  // look toward the Sun's azimuth when the observer changes, not on every time step
  const look = useMemo(
    () => eye.clone().add(direction(sunAz, 0).multiplyScalar(0.01)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eye],
  )
  const sun = direction(sunAz, sunEl)
  const earth = direction(earthAz, earthEl)
  // Display exposure, not photometry: scale the light so level ground stays readable at grazing Sun angles.
  const exposure = Math.min(40, 0.6 / Math.sin(Math.max(sunEl, 0.5) * RAD))
  return (
    <Canvas className="scene" shadows camera={{ near: 0.5, far: 30000, fov: 60 }}>
      <color attach="background" args={['#000']} />
      <Camera eye={eye} look={look} />
      <ambientLight intensity={0.12} />
      <directionalLight
        position={sun.clone().multiplyScalar(5000)}
        intensity={exposure * sunFraction}
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
        <mesh geometry={ring}>
          <meshBasicMaterial color="#1b1d22" side={THREE.DoubleSide} />
        </mesh>
        <mesh position={sun.clone().multiplyScalar(SUN_M)}>
          <sphereGeometry args={[SUN_M * Math.tan(SUN_RADIUS_DEG * RAD), 16, 16]} />
          <meshBasicMaterial color="#fff6d8" />
        </mesh>
        <mesh position={earth.clone().multiplyScalar(EARTH_M)}>
          <sphereGeometry args={[EARTH_M * Math.tan(Math.asin(EARTH_RADIUS_KM / earthDistKm)), 24, 24]} />
          <meshBasicMaterial color="#6f9fe8" />
        </mesh>
      </group>
      {geometry && onPatch ? (
        <mesh key="patch" geometry={geometry} rotation={[-Math.PI / 2, 0, 0]} position={[0, -ground, 0]} castShadow receiveShadow>
          <meshStandardMaterial color="#b4b0a8" roughness={1} />
        </mesh>
      ) : (
        // shortcut: heightmaps cover 5 x 5 km around each curated site; farther grid points get level ground (the ring is still exact). Upgrade by exporting a heightmap per opened point.
        // The keys keep React from reusing one mesh object for both branches (its geometry prop would go stale).
        <mesh key="level" rotation={[-Math.PI / 2, 0, 0]} position={[east, 0, -north]}>
          <circleGeometry args={[RING_M, 64]} />
          <meshLambertMaterial color="#8d8a84" />
        </mesh>
      )}
    </Canvas>
  )
}
