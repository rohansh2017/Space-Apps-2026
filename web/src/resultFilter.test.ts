import { describe, expect, it } from 'vitest'
import type { Candidate, Scored } from './engine/finder'
import { NO_FILTER, SHOW, activeCount, applyFilter, pillsOf, rowsOf } from './resultFilter'

const mask = new Uint16Array(360)
const cand = (id: string, label: string, lat: number): Candidate => ({ id, label, lat, lon: 0, elevM: 0, slopeDeg: 2, mask })
// plan at the pole's edge; points 1 km apart going north, two sites
const candidates = [cand('plan', 'Alpha', -89.5), ...Array.from({ length: 14 }, (_, i) => cand(`p${i}`, i % 2 ? 'Beta' : 'Alpha', -89.5 + (i + 1) * 0.033))]
const scored = (ci: number, start: number, fails: number, earth = true): Scored => ({
  candidate: ci, start, metrics: { sunlitPct: 0, longestDarkH: 0, longestLitH: 0, earthPct: 0 } as Scored['metrics'],
  evaluation: { passes: { min_earth_visible_pct: earth, max_slope_deg: fails === 0 }, fails, score: -ci },
})
const base = scored(0, 1000, 1)
const pool = candidates.slice(1).map((_, i) => scored(i + 1, 1000 + 24 * (14 - i), i < 5 ? 0 : 1, i % 3 !== 0))
const rows = rowsOf(pool, candidates, base)

describe('F30 result filters', () => {
  it('without filters shows the pool order, ten at a time, with ranks from the pool', () => {
    const { shown, matches } = applyFilter(rows, candidates, NO_FILTER)
    expect(matches).toBe(pool.length)
    expect(shown).toHaveLength(SHOW)
    expect(shown.map((x) => x.rank)).toEqual(Array.from({ length: SHOW }, (_, i) => i + 1))
  })
  it('days out keeps landings inside the range and ranks stay those of the pool', () => {
    const { shown, matches } = applyFilter(rows, candidates, { ...NO_FILTER, minDays: 3, maxDays: 5 })
    expect(matches).toBe(3)
    expect(shown.every((x) => x.days >= 3 && x.days <= 5)).toBe(true)
    expect(shown.map((x) => x.rank)).toEqual([10, 11, 12])
  })
  it('distance, site and criteria filters combine', () => {
    const near = applyFilter(rows, candidates, { ...NO_FILTER, maxKm: 4.5 })
    expect(near.shown.every((x) => x.km <= 4.5)).toBe(true)
    expect(near.matches).toBe(4)
    const beta = applyFilter(rows, candidates, { ...NO_FILTER, sites: ['Beta'] })
    expect(beta.shown.every((x) => candidates[x.r.candidate].label === 'Beta')).toBe(true)
    const pass = applyFilter(rows, candidates, { ...NO_FILTER, allPass: true })
    expect(pass.matches).toBe(5)
    const both = applyFilter(rows, candidates, { ...NO_FILTER, allPass: true, mustPass: ['min_earth_visible_pct'], sites: ['Beta'] })
    expect(both.shown.every((x) => x.r.evaluation.fails === 0 && x.r.evaluation.passes.min_earth_visible_pct && candidates[x.r.candidate].label === 'Beta')).toBe(true)
    expect(applyFilter(rows, candidates, { ...NO_FILTER, maxDays: 0 }).matches).toBe(0)
  })
  it('soonest sorts by landing hour', () => {
    const { shown } = applyFilter(rows, candidates, { ...NO_FILTER, sort: 'soonest' })
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
    const pills = pillsOf(f)
    expect(pills.map((p) => p.text)).toEqual(['Up to 10 days out', 'Within 2 km', 'Beta', 'Max terrain slope met'])
    expect(pills.map((p) => activeCount(p.remove))).toEqual([3, 3, 3, 3])
    expect(pillsOf({ ...NO_FILTER, minDays: 3 })[0].text).toBe('3+ days out')
  })
})
