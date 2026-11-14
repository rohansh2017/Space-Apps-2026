// Pure engine: no DOM, no React, no globals. Must match build/horizonwalk/engine.py (make parity).

export const R_MOON_KM = 1737.4
export const SUN_RADIUS_DEG = 0.265 // the Sun is a 0.53 deg disk
export const EARTH_MIN_EL_DEG = 1
export const EPHEM_STRIDE = 7 // sun xyz, earth xyz, earth distance km

const RAD = Math.PI / 180
type Vec3 = [number, number, number]

export interface SiteFrame {
  pos: Vec3 // site position, km, MOON_ME_DE440_ME421
  east: Vec3
  north: Vec3
  up: Vec3
}

export interface Angles {
  sunAz: number
  sunEl: number
  earthAz: number
  earthEl: number
}

export function siteFrame(latDeg: number, lonDeg: number, elevM: number): SiteFrame {
  const [cl, sl] = [Math.cos(latDeg * RAD), Math.sin(latDeg * RAD)]
  const [co, so] = [Math.cos(lonDeg * RAD), Math.sin(lonDeg * RAD)]
  const up: Vec3 = [cl * co, cl * so, sl]
  const r = R_MOON_KM + elevM / 1000
  return { pos: [up[0] * r, up[1] * r, up[2] * r], east: [-so, co, 0], north: [-sl * co, -sl * so, cl], up }
}

const dot = (a: Vec3, x: number, y: number, z: number) => a[0] * x + a[1] * y + a[2] * z

function azEl(f: SiteFrame, x: number, y: number, z: number): [number, number] {
  const [e, n, u] = [dot(f.east, x, y, z), dot(f.north, x, y, z), dot(f.up, x, y, z)]
  const az = Math.atan2(e, n) / RAD
  return [((az % 360) + 360) % 360, Math.atan2(u, Math.sqrt(e * e + n * n)) / RAD]
}

/** Sun and Earth azimuth/elevation (degrees) for one ephemeris row. Earth gets the parallax correction. */
export function siteAngles(table: ArrayLike<number>, row: number, f: SiteFrame): Angles {
  const i = row * EPHEM_STRIDE
  const [sunAz, sunEl] = azEl(f, table[i], table[i + 1], table[i + 2])
  const d = table[i + 6]
  const [earthAz, earthEl] = azEl(
    f,
    table[i + 3] * d - f.pos[0],
    table[i + 4] * d - f.pos[1],
    table[i + 5] * d - f.pos[2],
  )
  return { sunAz, sunEl, earthAz, earthEl }
}

/** Mask elevation (degrees) at any azimuth from the raw Uint16 bins: linear interpolation, wrapping. */
export function maskAt(maskRaw: ArrayLike<number>, azDeg: number): number {
  const az = ((azDeg % 360) + 360) % 360
  const k = Math.floor(az) % 360
  const f = az - Math.floor(az)
  const a = maskRaw[k] * 0.01 - 10
  const b = maskRaw[(k + 1) % 360] * 0.01 - 10
  return a * (1 - f) + b * f
}

/** Share of the solar disk above the mask (0..1), with the horizon taken as level across the disk. */
export function sunFraction(sunElDeg: number, maskElDeg: number): number {
  const k = Math.min(1, Math.max(-1, (maskElDeg - sunElDeg) / SUN_RADIUS_DEG))
  return 1 - (Math.acos(-k) + k * Math.sqrt(1 - k * k)) / Math.PI
}

export function earthVisible(earthElDeg: number, maskElDeg: number, minElDeg = EARTH_MIN_EL_DEG): boolean {
  return earthElDeg - maskElDeg >= minElDeg
}

// --- Metrics over a mission window (definitions: SPEC.md, "Metric definitions") ---

export type Constraints = Record<string, number | boolean>

/** Hourly visibility series for one point, with prefix sums and run lengths so any window is O(1). */
export interface Prepared {
  n: number
  frac: Float64Array // Sun visible fraction
  sunEl: Float64Array
  lit: Uint8Array
  earth: Uint8Array
  litLeft: Int32Array // hours left in the current lit or dark run, counting this hour
  earthLeft: Int32Array // same for the Earth visible / hidden run
  cumFrac: Float64Array // prefix sums, length n + 1
  cumEarth: Float64Array
  cumPower: Float64Array
  cumLit: Float64Array
  cumElLit: Float64Array
}

export interface Metrics {
  sunlitPct: number
  longestLitH: number
  longestDarkH: number
  earthPct: number
  powerIndex: number
  meanElLit: number | null
  landingOk: boolean
}

export interface Evaluation {
  passes: Record<string, boolean>
  fails: number
  score: number
}

function runsLeft(flags: Uint8Array): Int32Array {
  const left = new Int32Array(flags.length)
  for (let i = flags.length - 1; i >= 0; i--)
    left[i] = i + 1 < flags.length && flags[i + 1] === flags[i] ? left[i + 1] + 1 : 1
  return left
}

/** deck = horizontal array (sin elevation); default is a vertical mast (cos elevation). */
export function prepare(frac: ArrayLike<number>, earth: ArrayLike<number>, sunEl: ArrayLike<number>, deck = false): Prepared {
  const n = frac.length
  const p: Prepared = {
    n,
    frac: frac instanceof Float64Array ? frac : Float64Array.from(frac),
    sunEl: sunEl instanceof Float64Array ? sunEl : Float64Array.from(sunEl),
    lit: new Uint8Array(n),
    earth: earth instanceof Uint8Array ? earth : Uint8Array.from(earth),
    litLeft: new Int32Array(0),
    earthLeft: new Int32Array(0),
    cumFrac: new Float64Array(n + 1),
    cumEarth: new Float64Array(n + 1),
    cumPower: new Float64Array(n + 1),
    cumLit: new Float64Array(n + 1),
    cumElLit: new Float64Array(n + 1),
  }
  for (let i = 0; i < n; i++) {
    const f = p.frac[i]
    const el = p.sunEl[i] * RAD
    p.lit[i] = f > 0 ? 1 : 0
    p.cumFrac[i + 1] = p.cumFrac[i] + f
    p.cumEarth[i + 1] = p.cumEarth[i] + p.earth[i]
    p.cumPower[i + 1] = p.cumPower[i] + f * (deck ? Math.sin(el) : Math.cos(el))
    p.cumLit[i + 1] = p.cumLit[i] + p.lit[i]
    p.cumElLit[i + 1] = p.cumElLit[i] + (p.lit[i] ? p.sunEl[i] : 0)
  }
  p.litLeft = runsLeft(p.lit)
  p.earthLeft = runsLeft(p.earth)
  return p
}

/** Visibility series for `n` hours from ephemeris row `first` at one point. */
export function buildSeries(
  table: ArrayLike<number>, first: number, n: number, f: SiteFrame,
  maskRaw: ArrayLike<number> | null, minEarthElDeg = EARTH_MIN_EL_DEG, deck = false,
): Prepared {
  const frac = new Float64Array(n)
  const sunEl = new Float64Array(n)
  const earth = new Uint8Array(n)
  // Hot loop of the finder: siteAngles + maskAt + sunFraction + earthVisible, inlined so nothing is
  // allocated per hour. engine.test.ts checks it against those functions.
  const [ex, ey, ez] = f.east
  const [nx, ny, nz] = f.north
  const [ux, uy, uz] = f.up
  const [px, py, pz] = f.pos
  const mask = (azRad: number) => {
    if (!maskRaw) return 0
    let az = azRad / RAD
    if (az < 0) az += 360
    const k = Math.floor(az) % 360
    const w = az - Math.floor(az)
    return (maskRaw[k] * (1 - w) + maskRaw[(k + 1) % 360] * w) * 0.01 - 10
  }
  for (let i = 0, j = first * EPHEM_STRIDE; i < n; i++, j += EPHEM_STRIDE) {
    const sx = table[j], sy = table[j + 1], sz = table[j + 2]
    let e = ex * sx + ey * sy + ez * sz
    let nn = nx * sx + ny * sy + nz * sz
    let u = ux * sx + uy * sy + uz * sz
    const el = Math.atan2(u, Math.sqrt(e * e + nn * nn)) / RAD
    sunEl[i] = el
    const k = Math.min(1, Math.max(-1, (mask(Math.atan2(e, nn)) - el) / SUN_RADIUS_DEG))
    frac[i] = 1 - (Math.acos(-k) + k * Math.sqrt(1 - k * k)) / Math.PI
    const d = table[j + 6]
    const gx = table[j + 3] * d - px, gy = table[j + 4] * d - py, gz = table[j + 5] * d - pz
    e = ex * gx + ey * gy + ez * gz
    nn = nx * gx + ny * gy + nz * gz
    u = ux * gx + uy * gy + uz * gz
    earth[i] = Math.atan2(u, Math.sqrt(e * e + nn * nn)) / RAD - mask(Math.atan2(e, nn)) >= minEarthElDeg ? 1 : 0
  }
  return prepare(frac, earth, sunEl, deck)
}

/** Metrics for the window [start, start + hours). Walks run segments, not hours. */
export function windowMetrics(p: Prepared, start: number, hours: number): Metrics {
  const end = start + hours
  if (start < 0 || end > p.n) throw new RangeError('window runs past the end of the series')
  let longestLitH = 0
  let longestDarkH = 0
  for (let j = start; j < end; ) {
    const len = Math.min(p.litLeft[j], end - j)
    if (p.lit[j]) longestLitH = Math.max(longestLitH, len)
    else longestDarkH = Math.max(longestDarkH, len)
    j += len
  }
  const litHours = p.cumLit[end] - p.cumLit[start]
  return {
    sunlitPct: ((p.cumFrac[end] - p.cumFrac[start]) / hours) * 100,
    longestLitH,
    longestDarkH,
    earthPct: ((p.cumEarth[end] - p.cumEarth[start]) / hours) * 100,
    powerIndex: (p.cumPower[end] - p.cumPower[start]) / hours,
    meanElLit: litHours ? (p.cumElLit[end] - p.cumElLit[start]) / litHours : null,
    landingOk: p.lit[start] === 1 && p.earth[start] === 1,
  }
}

/** Hours from t until the lit (or Earth) state next changes; null if it does not within the series. */
export function nextChange(left: Int32Array, t: number): number | null {
  return t + left[t] < left.length ? left[t] : null
}

const clamp1 = (v: number) => Math.min(1, Math.max(-1, v))

/** Pass/fail and normalized margin per constraint, plus the weighted margin score (positive = passing). */
export function evaluate(m: Metrics, slopeDeg: number, c: Constraints, weights: Record<string, number> = {}): Evaluation {
  const durH = Number(c.mission_duration_days) * 24
  const margins: Record<string, number> = {
    min_continuous_sun_days: (m.longestLitH - Number(c.min_continuous_sun_days) * 24) / durH,
    max_continuous_dark_hours: (Number(c.max_continuous_dark_hours) - m.longestDarkH) / durH,
    min_earth_visible_pct: (m.earthPct - Number(c.min_earth_visible_pct)) / 100,
    max_slope_deg: (Number(c.max_slope_deg) - slopeDeg) / 30,
  }
  if (c.landing_sun_and_earth_visible) margins.landing_sun_and_earth_visible = m.landingOk ? 0 : -1
  const passes: Record<string, boolean> = {}
  let fails = 0
  let score = 0
  for (const [k, v] of Object.entries(margins)) {
    passes[k] = v >= 0
    if (v < 0) fails++
    score += (weights[k] ?? 1) * clamp1(v)
  }
  return { passes, fails, score }
}

/** South polar stereographic x/y in metres (true at the pole, R = 1,737,400 m). */
export function latLonToXY(latDeg: number, lonDeg: number): [number, number] {
  const r = 2 * R_MOON_KM * 1000 * Math.tan(((90 + latDeg) * RAD) / 2)
  return [r * Math.sin(lonDeg * RAD), r * Math.cos(lonDeg * RAD)]
}

/** Inverse of latLonToXY: [lat, lon] in degrees, lon in (-180, 180]. */
export function xyToLatLon(x: number, y: number): [number, number] {
  return [(2 * Math.atan(Math.hypot(x, y) / (2 * R_MOON_KM * 1000))) / RAD - 90, Math.atan2(x, y) / RAD]
}

/** Nearest precomputed grid point to a custom coordinate, with the ground distance in metres. */
export function snapToGrid<P extends { lat: number; lon: number; x: number; y: number }>(
  points: readonly P[], latDeg: number, lonDeg: number,
): { point: P; distanceM: number } {
  const [x, y] = latLonToXY(latDeg, lonDeg)
  let best = points[0]
  let bestD = Infinity
  for (const p of points) {
    const d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (d < bestD) [best, bestD] = [p, d]
  }
  const [a, b] = [siteFrame(latDeg, lonDeg, 0).pos, siteFrame(best.lat, best.lon, 0).pos]
  return { point: best, distanceM: Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) * 1000 }
}

/** The grid point one step from `current` toward a local compass direction, or null at the grid edge. */
export function nudgeNeighbour<P extends { lat: number; lon: number; index: number; region: string }>(
  points: readonly P[], current: P, dir: 'N' | 'E' | 'S' | 'W', n = 21,
): P | null {
  const f = siteFrame(current.lat, current.lon, 0)
  const want = dir === 'N' ? [0, 1] : dir === 'S' ? [0, -1] : dir === 'E' ? [1, 0] : [-1, 0]
  const [row, col] = [Math.floor(current.index / n), current.index % n]
  let best: P | null = null
  let bestCos = 0
  for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const [r, c] = [row + dr, col + dc]
    if (r < 0 || c < 0 || r >= n || c >= n) continue
    const p = points.find((q) => q.region === current.region && q.index === r * n + c)
    if (!p) continue
    const pos = siteFrame(p.lat, p.lon, 0).pos
    const d = [pos[0] - f.pos[0], pos[1] - f.pos[1], pos[2] - f.pos[2]]
    const e = f.east[0] * d[0] + f.east[1] * d[1] + f.east[2] * d[2]
    const no = f.north[0] * d[0] + f.north[1] * d[1] + f.north[2] * d[2]
    // the grid is square in stereographic x/y, so the best neighbour is at least cos 45 deg toward the wanted direction
    const cos = (e * want[0] + no * want[1]) / Math.hypot(e, no)
    if (cos > bestCos) [best, bestCos] = [p, cos]
  }
  return best
}
