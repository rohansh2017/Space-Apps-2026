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
  return [((az % 360) + 360) % 360, Math.atan2(u, Math.hypot(e, n)) / RAD]
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
