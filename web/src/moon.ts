// Geometry for the Moon view (unit sphere, R = 1). Pure: no DOM, no three.js. The renderer takes positions from
// here; every number shown to the user still comes from engine.ts.
import type { Constraints, Evaluation, Metrics, SiteFrame } from './engine/engine'
import { R_MOON_KM, buildSeries, evaluate, quatRotate, windowMetrics } from './engine/engine'

export type Vec3 = [number, number, number]
const R_M = R_MOON_KM * 1000
const RAD = Math.PI / 180

/** MOON_ME (z = north pole) to three.js axes (y up): a proper rotation, so handedness is kept. */
export const meToThree = ([x, y, z]: Readonly<Vec3>): Vec3 => [x, z, -y]
export const threeToMe = ([x, y, z]: Readonly<Vec3>): Vec3 => [x, -z, y]

/** Unit MOON_ME vector of a latitude and longitude. */
export function latLonToMe(latDeg: number, lonDeg: number): Vec3 {
  const cl = Math.cos(latDeg * RAD)
  return [cl * Math.cos(lonDeg * RAD), cl * Math.sin(lonDeg * RAD), Math.sin(latDeg * RAD)]
}

/** South polar stereographic x/y in metres of a unit MOON_ME vector, without trigonometry (same as engine latLonToXY). */
export const meToXY = (m: Readonly<Vec3>): [number, number] => [(2 * R_M * m[1]) / (1 - m[2]), (2 * R_M * m[0]) / (1 - m[2])]

/** Inverse of meToXY: the unit MOON_ME vector of a stereographic x/y in metres. */
export function xyToMe(x: number, y: number): Vec3 {
  const [sx, sy] = [x / (2 * R_M), y / (2 * R_M)]
  const k = 1 + sx * sx + sy * sy
  return [(2 * sy) / k, (2 * sx) / k, (sx * sx + sy * sy - 1) / k]
}

export const meToLatLon = (m: Readonly<Vec3>): [number, number] => [Math.asin(Math.max(-1, Math.min(1, m[2]))) / RAD, Math.atan2(m[1], m[0]) / RAD]

/** Nearest intersection of a ray with the exact unit sphere (not the mesh), or null if it misses. `dir` must be unit. */
export function raySphere(origin: Readonly<Vec3>, dir: Readonly<Vec3>): Vec3 | null {
  const b = origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2]
  const c = origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2 - 1
  const disc = b * b - c
  if (disc < 0) return null
  const t = -b - Math.sqrt(disc)
  if (t < 0) return null
  return [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t]
}

/**
 * Grid point under a stereographic position. A region is n x n points, `step` metres apart, row-major from
 * (-half, -half) around its centre. Outside the grid the nearest edge point is kept and `outside` is true.
 */
export function gridIndex(x: number, y: number, cx: number, cy: number, n = 21, step = 500): { index: number; outside: boolean } {
  const half = ((n - 1) / 2) * step
  const [col, row] = [Math.round((x - cx + half) / step), Math.round((y - cy + half) / step)]
  const clamp = (v: number) => Math.min(n - 1, Math.max(0, v))
  return { index: clamp(row) * n + clamp(col), outside: col !== clamp(col) || row !== clamp(row) }
}

/** Ray (three.js axes) to grid point: exact sphere, MOON_ME, stereographic x/y, then the 500 m grid. Null if the ray misses the Moon. */
export function pickGrid(origin: Readonly<Vec3>, dir: Readonly<Vec3>, cx: number, cy: number, n = 21, step = 500) {
  const hit = raySphere(origin, dir)
  if (!hit) return null
  const me = threeToMe(hit)
  const [x, y] = meToXY(me)
  const [lat, lon] = meToLatLon(me)
  return { ...gridIndex(x, y, cx, cy, n, step), x, y, lat, lon }
}

export interface Verdict {
  metrics: Metrics
  evaluation: Evaluation
}

/** Mission-window metrics and pass/fail for one point and landing hour, exactly as the plan's are computed; null if the window runs past the table. */
export function verdict(
  table: ArrayLike<number>, tableHours: number, hour: number, frame: SiteFrame, mask: ArrayLike<number> | null, slopeDeg: number, c: Constraints,
): Verdict | null {
  const dur = Math.round(Number(c.mission_duration_days) * 24)
  if (!(dur > 0) || hour + dur > tableHours) return null
  const metrics = windowMetrics(buildSeries(table, hour, dur, frame, mask, Number(c.min_earth_elevation_deg)), 0, dur)
  return { metrics, evaluation: evaluate(metrics, slopeDeg, c) }
}

/** Camera pose for the fly-down at eased time e in [0, 1]: direction interpolated linearly, altitude geometrically (reads as a zoom). */
export function flyPose(d0: Readonly<Vec3>, alt0: number, d1: Readonly<Vec3>, alt1: number, e: number): Vec3 {
  const d = [0, 1, 2].map((i) => d0[i] + (d1[i] - d0[i]) * e)
  const len = Math.hypot(d[0], d[1], d[2])
  const r = 1 + alt0 * (alt1 / alt0) ** e
  return [(d[0] / len) * r, (d[1] / len) * r, (d[2] / len) * r]
}

export const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/** Per-grid-point results for one region and landing hour: F15's sunlit %, plus Earth % and the verdict from the same series. */
export interface GridStats {
  region: string
  hour: number
  sun: Float32Array // sunlit % over the mission window, by point index
  earth: Float32Array // Earth visible %, by point index
  verdicts: (Verdict | null)[]
}

export function gridStats(
  points: readonly { region: string; index: number; lat: number; lon: number; elev_m: number }[], region: string, n: number,
  masks: Uint16Array, slopes: Uint8Array, table: ArrayLike<number>, tableHours: number, hour: number, c: Constraints,
  frameOf: (lat: number, lon: number, elevM: number) => SiteFrame,
): GridStats | null {
  const dur = Math.round(Number(c.mission_duration_days) * 24)
  if (!(dur > 0) || hour + dur > tableHours) return null
  const out: GridStats = { region, hour, sun: new Float32Array(n), earth: new Float32Array(n), verdicts: new Array(n).fill(null) }
  for (const p of points) {
    if (p.region !== region) continue
    const v = verdict(table, tableHours, hour, frameOf(p.lat, p.lon, p.elev_m), masks.subarray(p.index * 360, (p.index + 1) * 360), slopes[p.index], c)!
    out.sun[p.index] = v.metrics.sunlitPct
    out.earth[p.index] = v.metrics.earthPct
    out.verdicts[p.index] = v
  }
  return out
}

/** Texture coordinate of a unit MOON_ME vector on the whole-Moon map (equirectangular, col 0 = 0°E, row 0 = 90°N), with the image's row 0 at v = 1 as three.js loads it. */
export function globeUV(m: Readonly<Vec3>): [number, number] {
  const u = Math.atan2(m[1], m[0]) / (2 * Math.PI)
  return [u < 0 ? u + 1 : u, 0.5 + Math.asin(Math.max(-1, Math.min(1, m[2]))) / Math.PI]
}

/**
 * Texture coordinate on a site's heightmap (local east/north axes, row 0 = north, col 0 = west, pixel centres from
 * -span/2 to +span/2) of a unit MOON_ME vector, with the texture's row 0 at v = 0 (a DataTexture is not flipped).
 */
export function siteUV(m: Readonly<Vec3>, f: SiteFrame, n: number, spanM: number): [number, number] {
  const c = latLonToMe(...meToLatLon(f.up))
  const d = [m[0] - c[0], m[1] - c[1], m[2] - c[2]]
  const [e, no] = [f.east, f.north].map((a) => (a[0] * d[0] + a[1] * d[1] + a[2] * d[2]) * R_M)
  const cell = spanM / (n - 1)
  return [((e + spanM / 2) / cell + 0.5) / n, ((spanM / 2 - no) / cell + 0.5) / n]
}

/**
 * 8-bit hillshade of a site heightmap (n x n, row 0 = north), lit like the basemaps: they are lit from the image's
 * upper left (azimuth 315° from stereographic +y); at longitude λ that light, in the site's east/north axes, comes
 * from azimuth 315° − λ. Flat ground gets the same grey as on the basemaps (sin 35°).
 */
export function siteHillshade(heights: ArrayLike<number>, n: number, cellM: number, scaleM: number, lonDeg: number): Uint8Array {
  const az = (315 - lonDeg) * RAD
  const alt = 35 * RAD
  const [le, ln, lu] = [Math.sin(az) * Math.cos(alt), Math.cos(az) * Math.cos(alt), Math.sin(alt)]
  const out = new Uint8Array(n * n)
  const h = (r: number, c: number) => heights[Math.min(n - 1, Math.max(0, r)) * n + Math.min(n - 1, Math.max(0, c))] * scaleM
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const de = (h(r, c + 1) - h(r, c - 1)) / ((Math.min(n - 1, c + 1) - Math.max(0, c - 1)) * cellM) // east slope
      const dn = (h(r - 1, c) - h(r + 1, c)) / ((Math.min(n - 1, r + 1) - Math.max(0, r - 1)) * cellM) // north slope (row 0 = north)
      const s = (-de * le - dn * ln + lu) / Math.sqrt(de * de + dn * dn + 1)
      out[r * n + c] = Math.round(Math.max(0, Math.min(1, s)) * 255)
    }
  return out
}

/** Row-major 3 x 3 matrix taking an ICRF (J2000) direction to the Moon view's three.js axes at one hour: the hour's ICRF -> MOON_ME rotation (orientation table), then `meToThree`. */
export function icrfToThree(orientation: ArrayLike<number>, hour: number): number[] {
  const cols = ([[1, 0, 0], [0, 1, 0], [0, 0, 1]] as const).map((e) => meToThree(quatRotate(orientation, hour * 4, e)))
  return [0, 1, 2].flatMap((r) => cols.map((c) => c[r]))
}
