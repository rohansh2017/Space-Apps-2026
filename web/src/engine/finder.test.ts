import { describe, expect, it } from 'vitest'
import type { Constraints } from './engine'
import type { Candidate, Scored } from './finder'
import { diffParts, diffText, relaxations, runFinder } from './finder'
import { evaluate } from './engine'

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
    // 3 candidates x 31 daily starts, minus the plan itself, plus the plan and the hourly refinement
    expect(r.evaluated).toBeGreaterThanOrEqual(3 * 31)
    expect(r.results.every((x) => x.start >= 24 * 40)).toBe(true) // never earlier than the slipped date
  })
  it('F30: returns every candidate\'s best start as a pool that starts with the results', () => {
    const cands = [candidate('walled', 5, 0, 300), candidate('open', 0), candidate('steep', 0, 0, 0, 25), candidate('ridge', 5, 80, 200)]
    const r = runFinder(table, hours, cands, 24 * 40, C, {}, 2)
    expect(r.results).toHaveLength(2)
    expect(r.pool).toHaveLength(cands.length)
    expect(r.pool.slice(0, 2)).toEqual(r.results)
    expect(new Set(r.pool.map((x) => x.candidate)).size).toBe(cands.length)
    for (let i = 1; i < r.pool.length; i++) {
      const [a, b] = [r.pool[i - 1].evaluation, r.pool[i].evaluation]
      expect(a.fails < b.fails || (a.fails === b.fails && a.score >= b.score)).toBe(true)
    }
  })
  it('finds a later date at the same site when only the date is wrong', () => {
    // the Sun is behind the wall (azimuths 80..200 seen from this site) at the planned date
    const cands = [candidate('ridge', 5, 80, 200)]
    const r = runFinder(table, hours, cands, 24 * 40, C)
    expect(r.baseline.evaluation.fails).toBeGreaterThan(0)
    expect(r.results[0].candidate).toBe(0)
    expect(r.results[0].start).toBeGreaterThan(24 * 40)
    expect(r.results[0].evaluation.fails).toBe(0)
  })
  it('F27: finds the earliest hour the plan itself passes, forward only, and none when no date can help', () => {
    const r = runFinder(table, hours, [candidate('ridge', 5, 80, 200)], 24 * 40, C)
    expect(r.planPassStart).not.toBeNull()
    expect(r.planPassStart!).toBeGreaterThan(24 * 40)
    expect(r.planPassStart!).toBeLessThanOrEqual(r.results[0].start) // earliest pass, not the best-scoring one
    const open = runFinder(table, hours, [candidate('open', 0)], 24 * 40, C)
    expect(open.planPassStart).toBe(24 * 40) // it already passes at the planned hour
    const steep = runFinder(table, hours, [candidate('steep', 0, 0, 0, 25)], 24 * 40, C)
    expect(steep.planPassStart).toBeNull() // slope never changes with the date
  })
  it('F27: each relaxation, applied, makes that constraint pass', () => {
    const cands = [candidate('walled', 5, 0, 300, 14)]
    const r = runFinder(table, hours, cands, 24 * 40, C)
    const b = r.baseline
    const relax = relaxations(b.metrics, cands[0].slopeDeg, C, b.evaluation)
    expect(relax.map((x) => x.id).sort()).toEqual(Object.entries(b.evaluation.passes).filter(([, p]) => !p).map(([k]) => k).sort())
    expect(relax.find((x) => x.id === 'max_slope_deg')).toEqual({ id: 'max_slope_deg', actual: 14, limit: 10, needed: 14 })
    const loosened: Constraints = { ...C, ...Object.fromEntries(relax.map((x) => [x.id, x.needed])) }
    expect(evaluate(b.metrics, cands[0].slopeDeg, loosened).fails).toBe(0)
  })
  it('F29: earliest order keeps each point\'s first passing hour and ranks passing points by date', () => {
    const plan = candidate('steep', 0, 0, 0, 25) // never passes, so it is never an earliest result
    const ridge = candidate('ridge', 5, 80, 200)
    // the ridge's first passing hour, found by the hourly F27 walk with the ridge as the plan
    const first = runFinder(table, hours, [ridge], 24 * 40, C).planPassStart!
    expect(first).toBeGreaterThan(24 * 40)
    const cands = [plan, ridge, candidate('open', 0)]
    const r = runFinder(table, hours, cands, 24 * 40, C, {}, 10, { order: 'earliest' })
    const ids = r.results.map((x) => cands[x.candidate].id)
    expect(ids).toEqual(['open', 'ridge', 'steep']) // passing by date, then the failing one
    expect(r.results[0].start).toBe(24 * 40) // open passes at once
    expect(r.results[1].start).toBe(first)
  })
  it('F29: slipHours overrides the slip range', () => {
    const r = runFinder(table, hours, [candidate('a', 0), candidate('b', 0)], 24 * 40, C, {}, 10, { slipHours: 48 })
    expect(r.results.every((x) => x.start >= 24 * 40 && x.start <= 24 * 42)).toBe(true)
    expect(r.results.some((x) => x.start > 24 * 40)).toBe(true)
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
  it('gives the short signed shift used in result titles', () => {
    const cand = { ...base, lat: -88.767, lon: 1.6 }
    expect(diffParts(base, scored(100, 70, 61, 50), cand, scored(148, 79, 30, 45))).toEqual({
      where: '1.4 km NE', when: '2 days later', shift: '+2 days', metrics: '+9% sun, −31 h dark, −5% comms',
      km: expect.closeTo(1.436, 2), hours: 48,
    })
    expect(diffParts(base, scored(100, 70, 61, 50), base, scored(88, 70, 61, 50)).shift).toBe('−12 h')
    expect(diffParts(base, scored(100, 70, 61, 50), base, scored(100, 70, 61, 50)).shift).toBe('same date')
  })
})
