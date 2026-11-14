// Illustrative surface detail for the 3D view. The LOLA terrain stops at 20 m per cell; everything
// finer (small craters, soil texture) is procedural and is labelled as such in the app. No numbers come from it.
import * as THREE from 'three'

const N = 512

/** Deterministic PRNG so the texture is the same on every load. */
function mulberry(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Tileable height field: value-noise octaves plus crater bowls with raised rims. */
function heightField(): Float32Array {
  const rand = mulberry(7)
  const h = new Float32Array(N * N)
  for (let period = 8, amp = 1; period <= 128; period *= 2, amp *= 0.8) {
    const lattice = Float32Array.from({ length: period * period }, () => rand())
    const cell = N / period
    for (let y = 0; y < N; y++) {
      const [gy, fy] = [Math.floor(y / cell), (y % cell) / cell]
      const sy = fy * fy * (3 - 2 * fy)
      for (let x = 0; x < N; x++) {
        const [gx, fx] = [Math.floor(x / cell), (x % cell) / cell]
        const sx = fx * fx * (3 - 2 * fx)
        const v = (r: number, c: number) => lattice[(r % period) * period + (c % period)]
        h[y * N + x] += amp * ((v(gy, gx) * (1 - sx) + v(gy, gx + 1) * sx) * (1 - sy) + (v(gy + 1, gx) * (1 - sx) + v(gy + 1, gx + 1) * sx) * sy)
      }
    }
  }
  for (let k = 0; k < 260; k++) {
    const [cx, cy, r] = [rand() * N, rand() * N, 2 + rand() ** 4 * 30]
    const reach = Math.ceil(r * 1.5)
    for (let dy = -reach; dy <= reach; dy++)
      for (let dx = -reach; dx <= reach; dx++) {
        const d = Math.hypot(dx, dy) / r
        if (d > 1.5) continue
        const bowl = d < 1 ? -(1 - d * d) * 0.5 : 0.18 * (1 - (d - 1) / 0.5) ** 2
        const i = ((((Math.round(cy) + dy) % N) + N) % N) * N + ((((Math.round(cx) + dx) % N) + N) % N)
        h[i] += bowl * r * 0.05
      }
  }
  return h
}

function texture(pixels: Uint8ClampedArray, colour: boolean): THREE.DataTexture {
  const t = new THREE.DataTexture(pixels, N, N, THREE.RGBAFormat)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.generateMipmaps = true
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.anisotropy = 8
  if (colour) t.colorSpace = THREE.SRGBColorSpace
  t.needsUpdate = true
  return t
}

let cached: { normalMap: THREE.DataTexture; map: THREE.DataTexture } | null = null

/** Normal map and albedo for the regolith, built once. */
export function regolith() {
  if (cached) return cached
  const h = heightField()
  const normal = new Uint8ClampedArray(N * N * 4)
  const albedo = new Uint8ClampedArray(N * N * 4)
  const at = (x: number, y: number) => h[((y + N) % N) * N + ((x + N) % N)]
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const [dx, dy] = [(at(x + 1, y) - at(x - 1, y)) * 6, (at(x, y + 1) - at(x, y - 1)) * 6]
      const len = Math.hypot(dx, dy, 1)
      const i = (y * N + x) * 4
      normal.set([(-dx / len) * 127 + 128, (-dy / len) * 127 + 128, (1 / len) * 127 + 128, 255], i)
      const g = 150 + (at(x, y) - 1.7) * 22
      albedo.set([g, g * 0.985, g * 0.95, 255], i)
    }
  cached = { normalMap: texture(normal, false), map: texture(albedo, true) }
  return cached
}
