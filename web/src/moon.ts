// Geometry for the Moon view (unit sphere, R = 1). Pure: no DOM, no three.js. The renderer takes positions from
// here; every number shown to the user still comes from engine.ts.
import type { Constraints, Evaluation, Metrics, SiteFrame } from './engine/engine'
import { R_MOON_KM, buildSeries, evaluate, windowMetrics } from './engine/engine'

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
