import { describe, expect, it } from 'vitest'
import type { Candidate, Scored } from './engine/finder'
import type { Constraints } from './engine/engine'
import { NO_FILTER, SHOW, activeCount, applyFilter, listOf, meets, overridesOf, pillsOf, rowsOf, sameSet, thresholdText } from './resultFilter'

const mask = new Uint16Array(360)
const cand = (id: string, label: string, lat: number): Candidate => ({ id, label, lat, lon: 0, elevM: 0, slopeDeg: 2, mask })
// plan at the pole's edge; points 1 km apart going north, two sites
const candidates = [cand('plan', 'Alpha', -89.5), ...Array.from({ length: 14 }, (_, i) => cand(`p${i}`, i % 2 ? 'Beta' : 'Alpha', -89.5 + (i + 1) * 0.033))]
// the search's constraints; each row's metrics agree with its pass marks (Earth 40+ %, slope up to 10°)
const C: Constraints = { min_continuous_sun_days: 6, max_continuous_dark_hours: 80, min_earth_visible_pct: 40, max_slope_deg: 10, landing_sun_and_earth_visible: true }
const scored = (ci: number, start: number, fails: number, earth = true): Scored => ({
  candidate: ci, start,
  metrics: { sunlitPct: 0, longestDarkH: 10 * ci, longestLitH: 24 * ci, earthPct: earth ? 50 : 20, landingOk: ci % 2 === 0 } as Scored['metrics'],
  evaluation: { passes: { min_earth_visible_pct: earth, max_slope_deg: fails === 0 }, fails, score: -ci },
})
const base = scored(0, 1000, 1)
const pool = candidates.slice(1).map((_, i) => scored(i + 1, 1000 + 24 * (14 - i), i < 5 ? 0 : 1, i % 3 !== 0))
const rows = rowsOf(pool, candidates, base)

describe('F30 result filters', () => {
  it('without filters shows the pool order, ten at a time, with ranks from the pool', () => {
    const { shown, matches } = applyFilter(rows, candidates, NO_FILTER, C)
    expect(matches).toBe(pool.length)
    expect(shown).toHaveLength(SHOW)
    expect(shown.map((x) => x.rank)).toEqual(Array.from({ length: SHOW }, (_, i) => i + 1))
  })
  it('days out keeps landings inside the range and ranks stay those of the pool', () => {
    const { shown, matches } = applyFilter(rows, candidates, { ...NO_FILTER, minDays: 3, maxDays: 5 }, C)
    expect(matches).toBe(3)
    expect(shown.every((x) => x.days >= 3 && x.days <= 5)).toBe(true)
    expect(shown.map((x) => x.rank)).toEqual([10, 11, 12])
  })
  it('distance, site and criteria filters combine', () => {
    const near = applyFilter(rows, candidates, { ...NO_FILTER, maxKm: 4.5 }, C)
    expect(near.shown.every((x) => x.km <= 4.5)).toBe(true)
    expect(near.matches).toBe(4)
    const beta = applyFilter(rows, candidates, { ...NO_FILTER, sites: ['Beta'] }, C)
    expect(beta.shown.every((x) => candidates[x.r.candidate].label === 'Beta')).toBe(true)
    const pass = applyFilter(rows, candidates, { ...NO_FILTER, allPass: true }, C)
    expect(pass.matches).toBe(5)
    const both = applyFilter(rows, candidates, { ...NO_FILTER, allPass: true, mustPass: ['min_earth_visible_pct'], sites: ['Beta'] }, C)
    expect(both.shown.every((x) => x.r.evaluation.fails === 0 && x.r.evaluation.passes.min_earth_visible_pct && candidates[x.r.candidate].label === 'Beta')).toBe(true)
    expect(applyFilter(rows, candidates, { ...NO_FILTER, maxDays: 0 }, C).matches).toBe(0)
  })
  it('soonest sorts by landing hour', () => {
    const { shown } = applyFilter(rows, candidates, { ...NO_FILTER, sort: 'soonest' }, C)
    expect(shown.map((x) => x.r.start)).toEqual([...shown.map((x) => x.r.start)].sort((a, b) => a - b))
    expect(shown[0].rank).toBe(pool.length)
  })
  it('counts active filters, not the sort', () => {
    expect(activeCount(NO_FILTER)).toBe(0)
    expect(activeCount({ ...NO_FILTER, sort: 'soonest' })).toBe(0)
    expect(activeCount({ ...NO_FILTER, minDays: 1, maxDays: 4, maxKm: 2, sites: ['A', 'B'], allPass: true, mustPass: ['x'] })).toBe(6)
  })
  it('names each active filter as a pill that removes just that filter', () => {
    const f = { ...NO_FILTER, maxDays: 10, maxKm: 2, sites: ['Beta'], mustPass: ['max_slope_deg'] }
    const pills = pillsOf(f, C)
    expect(pills.map((p) => p.text)).toEqual(['Up to 10 days out', 'Within 2 km', 'Beta', 'Slope up to 10°'])
    expect(pills.map((p) => activeCount(p.remove))).toEqual([3, 3, 3, 3])
    expect(pillsOf({ ...NO_FILTER, minDays: 3 }, C)[0].text).toBe('3+ days out')
  })
  it('list words and set equality', () => {
    expect([listOf(['A']), listOf(['A', 'B']), listOf(['A', 'B', 'C'])]).toEqual(['A', 'A and B', 'A, B and C'])
    expect(sameSet(['a', 'b'], ['b', 'a'])).toBe(true)
    expect(sameSet(['a'], ['a', 'b'])).toBe(false)
  })
})

describe('F32 threshold sliders', () => {
  it('a ticked criterion at the constraint value keeps exactly the rows that pass it', () => {
    const f = { ...NO_FILTER, mustPass: ['min_earth_visible_pct'] }
    const { matches } = applyFilter(rows, candidates, f, C)
    expect(matches).toBe(rows.filter((x) => x.r.evaluation.passes.min_earth_visible_pct).length)
  })
  it('each slider compares in its constraint direction, from the metrics', () => {
    const sun = applyFilter(rows, candidates, { ...NO_FILTER, mustPass: ['min_continuous_sun_days'], thresholds: { min_continuous_sun_days: 10 } }, C)
    expect(sun.matches).toBe(5) // candidates 10..14 have 10+ days of continuous sun
    expect(sun.shown.every((x) => x.r.metrics.longestLitH >= 240)).toBe(true)
    const dark = applyFilter(rows, candidates, { ...NO_FILTER, mustPass: ['max_continuous_dark_hours'], thresholds: { max_continuous_dark_hours: 30 } }, C)
    expect(dark.matches).toBe(3) // candidates 1..3: at most 30 h dark
    const slope = applyFilter(rows, candidates, { ...NO_FILTER, mustPass: ['max_slope_deg'], thresholds: { max_slope_deg: 1.5 } }, C)
    expect(slope.matches).toBe(0) // every candidate sits on 2°
    expect(applyFilter(rows, candidates, { ...NO_FILTER, mustPass: ['max_slope_deg'], thresholds: { max_slope_deg: 2 } }, C).matches).toBe(pool.length)
    const landing = applyFilter(rows, candidates, { ...NO_FILTER, mustPass: ['landing_sun_and_earth_visible'] }, C)
    expect(landing.shown.every((x) => x.r.metrics.landingOk)).toBe(true)
  })
  it('meets() at the constraint value matches the engine (sun compared in hours)', () => {
    const r = pool[5] // candidate 6: 144 h = exactly 6 days
    expect(meets('min_continuous_sun_days', r, candidates[6], 6)).toBe(true)
    expect(meets('min_continuous_sun_days', r, candidates[6], 6.5)).toBe(false)
  })
  it('a slider value hides rows without a search, and survives only while its criterion is ticked', () => {
    const f = { ...NO_FILTER, mustPass: ['min_continuous_sun_days'], thresholds: { min_continuous_sun_days: 8 } }
    expect(overridesOf(f, C)).toEqual({ min_continuous_sun_days: 8 })
    expect(overridesOf({ ...f, thresholds: { min_continuous_sun_days: 6 } }, C)).toEqual({}) // same as the search
    expect(overridesOf({ ...f, mustPass: [] }, C)).toEqual({}) // unticked
    expect(overridesOf({ ...f, allPass: true }, C)).toEqual({})
    const [pill] = pillsOf(f, C)
    expect(pill.text).toBe('Sun 8+ days')
    expect(pill.remove.mustPass).toEqual([])
    expect(pill.remove.thresholds).toEqual({})
  })
  it('names thresholds the way the pills do', () => {
    expect(thresholdText('max_continuous_dark_hours', 60)).toBe('Dark up to 60 h')
    expect(thresholdText('min_earth_visible_pct', 50)).toBe('Earth 50+ %')
    expect(thresholdText('max_slope_deg', 7.5)).toBe('Slope up to 7.5°')
    expect(thresholdText('landing_sun_and_earth_visible', 1)).toBe('Sun + Earth at landing met')
  })
})
