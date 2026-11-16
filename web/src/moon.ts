// Geometry for the Moon view (unit sphere, R = 1). Pure: no DOM, no three.js. The renderer takes positions from
// here; every number shown to the user still comes from engine.ts.
import type { Constraints, Evaluation, Metrics, SiteFrame } from './engine/engine'
import { R_MOON_KM, buildSeries, evaluate, quatRotate, siteFrame, windowMetrics } from './engine/engine'

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

/**
 * Direction and distance from one point to another on the sphere (D76): the azimuth in degrees east of north in the
 * starting point's own east/north axes (the engine's site frame), and the great-circle distance in km on R.
 */
export function bearingTo(from: { lat: number; lon: number }, to: { lat: number; lon: number }): { azDeg: number; distKm: number } {
  const f = siteFrame(from.lat, from.lon, 0)
  const t = latLonToMe(to.lat, to.lon)
  const d = (a: Readonly<Vec3>) => a[0] * t[0] + a[1] * t[1] + a[2] * t[2]
  const az = Math.atan2(d(f.east), d(f.north)) / RAD
  return { azDeg: ((az % 360) + 360) % 360, distKm: Math.acos(Math.max(-1, Math.min(1, d(f.up)))) * R_MOON_KM }
}

export const meToLatLon = (m: Readonly<Vec3>): [number, number] => [Math.asin(Math.max(-1, Math.min(1, m[2]))) / RAD, Math.atan2(m[1], m[0]) / RAD]

/** Nearest intersection of a ray with the exact sphere of radius r (not the mesh), or null if it misses. `dir` must be unit. */
export function raySphere(origin: Readonly<Vec3>, dir: Readonly<Vec3>, r = 1): Vec3 | null {
  const b = origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2]
  const c = origin[0] ** 2 + origin[1] ** 2 + origin[2] ** 2 - r * r
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

/** Lunar heights stay within these (metres above R): LOLA spans about -9.1 to +10.8 km. */
const H_MIN = -9500
const H_MAX = 11_000

/**
 * Where a ray (three.js axes) meets the raised terrain, whose radius is 1 + exag x height / R (D67): marched in
 * 256 steps between the highest and lowest the ground can be, then the first crossing bisected. Without a height
 * function it is the exact unit sphere. Where no grid covers the ray, the ground is at R.
 */
export function rayRelief(origin: Readonly<Vec3>, dir: Readonly<Vec3>, heightAt?: (me: Vec3) => number | null, exag = 1): Vec3 | null {
  if (!heightAt) return raySphere(origin, dir)
  // the march starts where the ray enters the highest the ground can be, or at the eye when it is already below that
  const rTop = 1 + (exag * H_MAX) / R_M
  const inside = Math.hypot(origin[0], origin[1], origin[2]) <= rTop
  const top = inside ? origin : raySphere(origin, dir, rTop)
  if (!top) return null
  const at = (t: number): Vec3 => [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t]
  /** Height of the ray above the ground at t, in units of R (negative below it). */
  const above = (t: number) => {
    const p = at(t)
    const r = Math.hypot(p[0], p[1], p[2])
    return r - 1 - (exag * (heightAt(threeToMe([p[0] / r, p[1] / r, p[2] / r])) ?? 0)) / R_M
  }
  const t0 = Math.max(0, (top[0] - origin[0]) * dir[0] + (top[1] - origin[1]) * dir[1] + (top[2] - origin[2]) * dir[2])
  // the march ends where the ray reaches the lowest ground, or at its closest approach when it misses that sphere
  const low = raySphere(origin, dir, 1 + (exag * H_MIN) / R_M)
  const t1 = low
    ? (low[0] - origin[0]) * dir[0] + (low[1] - origin[1]) * dir[1] + (low[2] - origin[2]) * dir[2]
    : -(origin[0] * dir[0] + origin[1] * dir[1] + origin[2] * dir[2])
  const n = 256
  let prev = t0
  for (let k = 1; k <= n; k++) {
    const t = t0 + ((t1 - t0) * k) / n
    if (above(t) <= 0) {
      let [lo, hi] = [prev, t]
      for (let j = 0; j < 40 && (hi - lo) * R_M > 0.001; j++) {
        const mid = (lo + hi) / 2
        if (above(mid) > 0) lo = mid
        else hi = mid
      }
      return at(hi)
    }
    prev = t
  }
  return null
}

const normalise = (v: Readonly<Vec3>): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** Ray (three.js axes) to grid point: the terrain (or the exact sphere), MOON_ME, stereographic x/y, then the 500 m grid. Null if the ray misses the Moon. */
export function pickGrid(
  origin: Readonly<Vec3>, dir: Readonly<Vec3>, cx: number, cy: number, n = 21, step = 500, heightAt?: (me: Vec3) => number | null, exag = 1,
) {
  const hit = rayRelief(origin, dir, heightAt, exag)
  if (!hit) return null
  const me = threeToMe(normalise(hit))
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

/**
 * One elevation grid of the Moon view's relief (D67): 16-bit values, metres = offset + value x scale above
 * R = 1,737,400 m. `kind` says how a MOON_ME direction maps to the grid:
 * - globe: equirectangular, col 0 = 0°E, row 0 = 90°N, pixel-registered (w = 2h);
 * - stereo: square, south polar stereographic x/y (row 0 = +y, col 0 = -x) over centre +- half (metres);
 * - site: square, a site heightmap in its east/north axes (row 0 = north, col 0 = west), pixel centres over +- span/2.
 */
export type ReliefGrid =
  | { kind: 'globe'; values: Uint16Array; w: number; h: number; offset: number; scale: number }
  | { kind: 'stereo'; values: Uint16Array; n: number; cx: number; cy: number; half: number; offset: number; scale: number }
  | { kind: 'site'; values: Uint16Array; n: number; frame: SiteFrame; centre: Vec3; span: number; offset: number; scale: number }

/** Bilinear sample at fractional pixel (col, row), clamped to the edge pixels. */
function bilinear(v: Uint16Array, w: number, h: number, col: number, row: number, wrap: boolean): number {
  const c0 = Math.floor(col)
  const r0 = Math.max(0, Math.min(h - 2, Math.floor(row)))
  const [fc, fr] = [col - c0, Math.max(0, Math.min(1, row - r0))]
  const cc = (c: number) => (wrap ? ((c % w) + w) % w : Math.max(0, Math.min(w - 1, c)))
  const [a, b] = [cc(c0), cc(c0 + 1)]
  const top = v[r0 * w + a] * (1 - fc) + v[r0 * w + b] * fc
  const bot = v[(r0 + 1) * w + a] * (1 - fc) + v[(r0 + 1) * w + b] * fc
  return top * (1 - fr) + bot * fr
}

/** Height in metres of one grid at a unit MOON_ME direction, or null outside it. */
export function gridHeight(g: ReliefGrid, m: Readonly<Vec3>): number | null {
  if (g.kind === 'globe') {
    const lon = Math.atan2(m[1], m[0]) / (2 * Math.PI)
    const lat = Math.asin(Math.max(-1, Math.min(1, m[2])))
    const col = (lon < 0 ? lon + 1 : lon) * g.w - 0.5
    const row = (0.5 - lat / Math.PI) * g.h - 0.5
    return g.offset + g.scale * bilinear(g.values, g.w, g.h, col, row, true)
  }
  if (g.kind === 'stereo') {
    const [x, y] = meToXY(m)
    const [u, v] = [(x - g.cx + g.half) / (2 * g.half), (g.cy + g.half - y) / (2 * g.half)]
    if (u < 0 || u > 1 || v < 0 || v > 1) return null
    return g.offset + g.scale * bilinear(g.values, g.n, g.n, u * g.n - 0.5, v * g.n - 0.5, false)
  }
  const d = [m[0] - g.centre[0], m[1] - g.centre[1], m[2] - g.centre[2]]
  const [e, no] = [g.frame.east, g.frame.north].map((a) => (a[0] * d[0] + a[1] * d[1] + a[2] * d[2]) * R_M)
  if (Math.abs(e) > g.span / 2 || Math.abs(no) > g.span / 2) return null
  const cell = g.span / (g.n - 1)
  return g.offset + g.scale * bilinear(g.values, g.n, g.n, (e + g.span / 2) / cell, (g.span / 2 - no) / cell, false)
}

/** Height of the finest loaded grid that covers a direction (grids ordered coarse to fine), or null when none does. */
export function reliefAt(grids: readonly (ReliefGrid | null)[], m: Readonly<Vec3>): number | null {
  for (let k = grids.length - 1; k >= 0; k--) {
    const g = grids[k]
    const h = g ? gridHeight(g, m) : null
    if (h !== null) return h
  }
  return null
}

/**
 * 16-bit heights as an RG8 texture (high byte, low byte). Bilinear filtering is linear, so it filters the two bytes
 * into the right 16-bit value; mipmaps would round the high byte, so relief textures have none.
 */
export function packRG8(values: Uint16Array): Uint8Array {
  const out = new Uint8Array(values.length * 2)
  for (let k = 0; k < values.length; k++) {
    out[2 * k] = values[k] >> 8
    out[2 * k + 1] = values[k] & 255
  }
  return out
}

/** Topo layer contour spacing in metres (D68): the whole polar cap, a site's 64 km context, a site's 5 km heightmap. */
export function contourInterval(level: 'pole' | 'site' | 'patch'): number {
  return level === 'pole' ? 1000 : level === 'site' ? 100 : 20
}
