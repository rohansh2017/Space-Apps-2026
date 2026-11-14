// Star field from the Yale Bright Star Catalogue (stars.bin). Positions and magnitudes are catalogue
// values; the colour is an approximation from B-V (black-body temperature), not a measured spectrum.
import * as THREE from 'three'

/** Ballesteros (2012) B-V -> effective temperature, then a black-body -> sRGB fit (Helland). Each channel 0..1. */
export function starColour(bv: number): [number, number, number] {
  if (!Number.isFinite(bv)) return [1, 1, 1]
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)) / 100
  const clamp = (v: number) => Math.min(255, Math.max(0, v)) / 255
  const r = t <= 66 ? 255 : 329.698727446 * (t - 60) ** -0.1332047592
  const g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * (t - 60) ** -0.0755148492
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307
  return [clamp(r), clamp(g), clamp(b)]
}

// pixel size and brightness by V magnitude; the brightest few are bigger, the faintest dim
const CLASSES = [
  { brighter: 1.0, size: 3.4 },
  { brighter: 2.5, size: 2.6 },
  { brighter: 4.0, size: 1.9 },
  { brighter: 99, size: 1.3 },
]

/** A group of point clouds on a sphere of `radius`, in ICRF axes. Rotate the group into the scene per hour. */
export function starField(stars: Float32Array, radius: number): THREE.Group {
  const group = new THREE.Group()
  group.matrixAutoUpdate = false
  let from = -99
  for (const { brighter, size } of CLASSES) {
    const pos: number[] = []
    const col: number[] = []
    for (let i = 0; i < stars.length; i += 5) {
      const v = stars[i + 3]
      if (v < from || v >= brighter) continue
      pos.push(stars[i] * radius, stars[i + 1] * radius, stars[i + 2] * radius)
      const k = Math.min(1, Math.max(0.22, 10 ** (-0.4 * (v - 1.5)))) // fainter stars dimmer, not just smaller
      col.push(...starColour(stars[i + 4]).map((c) => c * k))
    }
    from = brighter
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3))
    group.add(new THREE.Points(g, new THREE.PointsMaterial({ size, sizeAttenuation: false, vertexColors: true, toneMapped: false })))
  }
  return group
}

/** Scene matrix (x east, y up, -z north) from a row-major ICRF -> east/north/up matrix. */
export function sceneMatrix(m: readonly number[], target: THREE.Matrix4): THREE.Matrix4 {
  return target.set(m[0], m[1], m[2], 0, m[6], m[7], m[8], 0, -m[3], -m[4], -m[5], 0, 0, 0, 0, 1)
}
