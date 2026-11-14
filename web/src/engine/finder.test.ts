import { describe, expect, it } from 'vitest'
import type { Constraints } from './engine'
import type { Candidate, Scored } from './finder'
import { diffText, runFinder } from './finder'

const C: Constraints = {
  mission_duration_days: 7, min_continuous_sun_days: 6, max_continuous_dark_hours: 80, min_earth_visible_pct: 40,
  min_earth_elevation_deg: 1, landing_sun_and_earth_visible: true, max_slope_deg: 10, slip_range_days: 30, search_radius_km: 5,
}

/** Mock ephemeris: the Sun circles the horizon of a polar site once per 708 h at +1.5 deg; Earth sits at 5 deg. */
function mockTable(hours: number): Float32Array {
  const t = new Float32Array(hours * 7)
  for (let h = 0; h < hours; h++) {
    const a = (2 * Math.PI * h) / 708
    const z = -Math.sin((1.5 * Math.PI) / 180)
    const r = Math.sqrt(1 - z * z)
    t.set([r * Math.cos(a), r * Math.sin(a), z, 0.996, 0, -0.0872, 384400], h * 7)
  }
  return t
}

/** A flat horizon, with a wall of the given height across an azimuth range. */
function candidate(id: string, wallDeg: number, from = 0, to = 0, slopeDeg = 2, lat = -89.9): Candidate {
  const mask = new Uint16Array(360).fill(1000)
  for (let az = from; az < to; az++) mask[az] = (wallDeg + 10) * 100
  return { id, label: id, lat, lon: 0, elevM: 0, slopeDeg, mask }
}

describe('finder', () => {
  const hours = 24 * 120
  const table = mockTable(hours)
  it('ranks an open site above a walled one and reports per-constraint pass/fail', () => {
    const cands = [candidate('walled', 5, 0, 300), candidate('open', 0), candidate('steep', 0, 0, 0, 25)]
    const r = runFinder(table, hours, cands, 24 * 40, C)
    expect(r.baseline.candidate).toBe(0)
    expect(r.baseline.evaluation.passes.min_continuous_sun_days).toBe(false)
    expect(cands[r.results[0].candidate].id).toBe('open')
    expect(r.results[0].evaluation.fails).toBe(0)
    const steep = r.results.find((x) => cands[x.candidate].id === 'steep')!
    expect(steep.evaluation.passes.max_slope_deg).toBe(false)
    expect(steep.evaluation.passes.min_continuous_sun_days).toBe(true)
    // 3 candidates x 61 daily starts, minus the plan itself, plus the plan and the hourly refinement
    expect(r.evaluated).toBeGreaterThanOrEqual(3 * 61)
  })
  it('finds a later date at the same site when only the date is wrong', () => {
    // the Sun is behind the wall (azimuths 80..200 seen from this site) at the planned date
    const cands = [candidate('ridge', 5, 80, 200)]
    const r = runFinder(table, hours, cands, 24 * 40, C)
    expect(r.baseline.evaluation.fails).toBeGreaterThan(0)
    expect(r.results[0].candidate).toBe(0)
    expect(r.results[0].start).not.toBe(24 * 40)
    expect(r.results[0].evaluation.fails).toBe(0)
  })
  it('refuses a window that runs past the ephemeris', () => {
    expect(() => runFinder(table, hours, [candidate('a', 0)], hours - 10, C)).toThrow(RangeError)
  })
})

describe('difference text', () => {
  const scored = (start: number, sunlitPct: number, longestDarkH: number, earthPct: number): Scored => ({
    candidate: 0, start,
    metrics: { sunlitPct, longestLitH: 0, longestDarkH, earthPct, powerIndex: 0, meanElLit: null, landingOk: true },
    evaluation: { passes: {}, fails: 0, score: 0 },
  })
  const base = candidate('base', 0, 0, 0, 2, -88.8)
  it('matches the spec example shape', () => {
    // 0.0327 deg of latitude north-east-ish: move north (toward the equator) and east
    const cand = { ...base, lat: -88.767, lon: 1.6 }
    expect(diffText(base, scored(100, 70, 61, 50), cand, scored(148, 79, 30, 45))).toBe(
      '1.4 km NE, 2 days later: +9% sun, −31 h dark, −5% comms',
    )
  })
  it('handles the same site, earlier dates and sub-day shifts', () => {
    expect(diffText(base, scored(100, 70, 61, 50), base, scored(88, 70, 61, 50))).toBe(
      'Same site, 12 h earlier: +0% sun, +0 h dark, +0% comms',
    )
    expect(diffText(base, scored(100, 70, 61, 50), base, scored(64, 60, 70, 50))).toBe(
      'Same site, 1.5 days earlier: −10% sun, +9 h dark, +0% comms',
    )
  })
})
