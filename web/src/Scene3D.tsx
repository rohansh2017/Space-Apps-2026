import { OrbitControls } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import * as THREE from 'three'
import type { Site } from './data'
import { loadHeightmap } from './data'
import { SUN_RADIUS_DEG } from './engine/engine'

const RAD = Math.PI / 180
const EYE_M = 2
const SUN_DIST_M = 8000

/** Unit vector for an azimuth/elevation in scene axes: x east, y up, -z north. */
const direction = (az: number, el: number) =>
  new THREE.Vector3(Math.sin(az * RAD) * Math.cos(el * RAD), Math.sin(el * RAD), -Math.cos(az * RAD) * Math.cos(el * RAD))

interface Props {
  site: Site
  sunAz: number
  sunEl: number
  sunFraction: number // from the engine; the renderer never decides visibility
}

/** First-person view from 2 m above the terrain, in local metric coordinates centred on the site. */
export default function Scene3D({ site, sunAz, sunEl, sunFraction }: Props) {
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

  const geometry = useMemo(() => {
    if (!heights) return null
    const n = hm.size_px
    const mid = n / 2
    // ground under the camera = mean of the four centre cells
    const ground =
      (heights[(mid - 1) * n + mid - 1] + heights[(mid - 1) * n + mid] + heights[mid * n + mid - 1] + heights[mid * n + mid]) / 4
    const g = new THREE.PlaneGeometry(hm.span_m, hm.span_m, n - 1, n - 1)
    const pos = g.attributes.position
    // plane rows run north to south like the heightmap; z becomes "up" after the mesh rotation
    for (let i = 0; i < pos.count; i++) pos.setZ(i, (heights[i] - ground) * hm.scale_m)
    g.computeVertexNormals()
    return g
  }, [heights, hm.size_px, hm.span_m, hm.scale_m])

  const sun = direction(sunAz, sunEl)
  const look = direction(sunAz, 0).multiplyScalar(0.01)
  return (
    <Canvas className="scene" camera={{ position: [0, EYE_M, 0], near: 0.5, far: 20000, fov: 60 }}>
      <color attach="background" args={['#000']} />
      <ambientLight intensity={0.04} />
      <directionalLight position={sun.clone().multiplyScalar(1000)} intensity={3 * sunFraction} />
      <mesh position={sun.clone().multiplyScalar(SUN_DIST_M).setY(sun.y * SUN_DIST_M + EYE_M)}>
        <sphereGeometry args={[SUN_DIST_M * Math.tan(SUN_RADIUS_DEG * RAD), 16, 16]} />
        <meshBasicMaterial color="#fff6d8" />
      </mesh>
      {geometry && (
        <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
          <meshStandardMaterial color="#9a9a9a" roughness={1} />
        </mesh>
      )}
      {/* orbiting a target 1 cm ahead of the eye is a look-around; negative speed makes drag feel natural */}
      <OrbitControls
        key={site.id}
        target={[look.x, EYE_M, look.z]}
        enableZoom={false}
        enablePan={false}
        rotateSpeed={-0.4}
      />
    </Canvas>
  )
}
