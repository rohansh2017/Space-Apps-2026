import { describe, expect, it } from 'vitest'
import schema from '../public/data/constraints.schema.json'
import {
  DEFAULT_SPEC, checkLandBy, copilotSummary, isEmptyPlan, localPlan, parseCopilot, planSite, readSlipLocally, slipFrom, specFromPlan,
  whenText, whereText, windowHours, withLocalSlip,
} from './copilot'
import type { ConstraintDef } from './data'
import type { Candidate, FinderResult, Scored } from './engine/finder'

const defs = schema.constraints as ConstraintDef[]
const sites = ['haworth', 'malapert-massif']

describe('F29 copilot reply validation', () => {
  it('keeps a valid slip, where, when and constraints', () => {
    const p = parseCopilot(defs, sites, {
      constraints: { min_earth_visible_pct: 60 },
      slip: { days: 11, quote: 'slipped by 11 days' },
      where: { scope: 'current', quote: 'stay near the rim' },
      when: { order: 'earliest', window_days: 10, quote: 'soonest' },
    })
    expect(p.rejected).toEqual([])
    expect(p.values).toEqual({ min_earth_visible_pct: 60 })
    expect(p.slipDays).toBe(11)
    expect(p.where).toEqual({ scope: 'current', sites: [], withinKm: null })
    expect(p.when).toEqual({ order: 'earliest', landBy: null, windowDays: 10 })
  })
  it('names and drops unknown sites, out-of-range numbers, bad dates and unknown keys, never coercing', () => {
    const p = parseCopilot(defs, sites, {
      constraints: { max_slope_deg: 99 },
      slip: { days: 45 },
      where: { scope: 'sites', sites: ['tycho'], within_km: 9 },
      when: { order: 'fastest', land_by_utc: 'next tuesday' },
      fuel: 1,
    })
    const r = p.rejected.join('; ')
    expect(r).toMatch(/max_slope_deg = 99/)
    expect(r).toMatch(/slip = 45 days \(outside 0–30 days\)/)
    expect(r).toMatch(/site = "tycho"/)
    expect(r).toMatch(/within 9 km/)
    expect(r).toMatch(/order = "fastest"/)
    expect(r).toMatch(/land by "next tuesday" \(not a date\)/)
    expect(r).toMatch(/fuel \(unknown field\)/)
    expect(isEmptyPlan(p)).toBe(true)
  })
  it('reads named sites, a distance and a date-only land-by', () => {
    const p = parseCopilot(defs, sites, { where: { scope: 'sites', sites: ['haworth', 'malapert-massif'], within_km: 2 }, when: { land_by_utc: '2026-12-20' } })
    expect(p.where).toEqual({ scope: 'sites', sites: ['haworth', 'malapert-massif'], withinKm: 2 })
    expect(p.when).toEqual({ order: 'margin', landBy: Date.parse('2026-12-20T23:59:59Z'), windowDays: null })
  })
  it('rejects a non-object reply', () => {
    expect(parseCopilot(defs, sites, 'hello').rejected).toEqual(['reply is not an object'])
  })
})

describe('F29 local slip reading', () => {
  it.each([
    ['My mission slipped by 11 days. Stay near the rim.', 11],
    ['launch delayed two weeks', 14],
    ['the landing slips 36 hours', 1.5],
    ['we were postponed by 3 days', 3],
    ['Launch slipped a week, any site', 7],
  ])('%s → %d days', (text, days) => expect(readSlipLocally(text)).toBe(days))
  it('finds nothing without a slip word, or beyond 30 days', () => {
    expect(readSlipLocally('need 11 days of sun')).toBeNull()
    expect(readSlipLocally('slipped by 9 weeks')).toBeNull()
  })
  it('fills a slip Gemini left out, and says so', () => {
    const p = withLocalSlip(parseCopilot(defs, sites, { where: { scope: 'current', quote: 'near the rim' } }), 'slipped by 11 days, near the rim')
    expect(p.slipDays).toBe(11)
    expect(p.notes[0]).toMatch(/read from your words/)
  })
  it('keeps the slip alone when Gemini is unreachable', () => {
    const p = localPlan('slipped by 11 days, stay near the rim', 'Too many requests')!
    expect(p).toMatchObject({ slipDays: 11, where: null, when: null, local: true })
    expect(p.notes[0]).toMatch(/Read without Gemini \(Too many requests\)/)
    expect(localPlan('stay near the rim', 'x')).toBeNull()
  })
})

describe('F29 slip anchor and search spec', () => {
  it('measures the slip from the original plan, so applying it twice does not stack', () => {
    const a = slipFrom(null, 100, 11, 10_000)
    expect(a).toEqual({ origin: 100, applied: 364 })
    expect(slipFrom(a, a.applied, 11, 10_000)).toEqual(a) // the same slip again: same landing
    expect(slipFrom(a, a.applied, 5, 10_000)).toEqual({ origin: 100, applied: 220 }) // a different slip, same origin
  })
  it('takes a date moved by hand as the new original, and clamps to the ephemeris', () => {
    const a = slipFrom(null, 100, 11, 10_000)
    expect(slipFrom(a, 500, 1, 10_000)).toEqual({ origin: 500, applied: 524 })
    expect(slipFrom(null, 9_990, 30, 10_000).applied).toBe(10_000)
  })
  it('turns a single named site into the plan\'s site, searched as "current"', () => {
    const p = parseCopilot(defs, sites, { where: { scope: 'sites', sites: ['haworth'] } })
    expect(planSite(p)).toBe('haworth')
    expect(specFromPlan(p).scope).toBe('current')
    const two = parseCopilot(defs, sites, { where: { scope: 'sites', sites: ['haworth', 'malapert-massif'] } })
    expect(planSite(two)).toBeNull()
    expect(specFromPlan(two)).toMatchObject({ scope: 'sites', sites: ['haworth', 'malapert-massif'] })
  })
  it('turns a land-by date or a window into search hours, and drops a land-by before the slipped date', () => {
    const t0 = Date.parse('2026-12-14T14:00:00Z')
    expect(windowHours({ ...DEFAULT_SPEC, landBy: t0 + 48 * 3_600_000 }, t0)).toBe(48)
    expect(windowHours({ ...DEFAULT_SPEC, windowDays: 3 }, t0)).toBe(72)
    expect(windowHours(DEFAULT_SPEC, t0)).toBeNull()
    const p = checkLandBy(parseCopilot(defs, sites, { when: { land_by_utc: '2026-12-10' } }), t0, (ms) => new Date(ms).toISOString().slice(0, 10))
    expect(p.when).toBeNull()
    expect(p.rejected[0]).toMatch(/land by 2026-12-10 \(before the slipped landing, 2026-12-14\)/)
  })
  it('says what is searched in words', () => {
    const name = (id: string) => ({ haworth: 'Haworth', 'malapert-massif': 'Malapert Massif' })[id] ?? id
    expect(whereText({ scope: 'current', sites: [], withinKm: null }, 'Shackleton rim', name, 5)).toBe("Shackleton rim's grid within 5 km")
    expect(whereText({ scope: 'sites', sites: ['haworth', 'malapert-massif'], withinKm: null }, 'Shackleton rim', name, 5)).toBe('the grids of Haworth, Malapert Massif')
    expect(whereText({ scope: 'all', sites: [], withinKm: null }, 'x', name, 5)).toBe("every site's full grid")
    expect(whenText({ order: 'earliest', landBy: null, windowDays: 4 }, String)).toBe('earliest date that meets everything first, within 4 days of the slipped date')
  })
})

describe('F26/F29 copilot summary', () => {
  const cand = (id: string, lat: number): Candidate => ({ id, label: id, lat, lon: 0, elevM: 0, slopeDeg: 2, mask: new Uint16Array(360) })
  const scored = (candidate: number, start: number, fails: number): Scored => ({
    candidate, start,
    metrics: { sunlitPct: 50, longestLitH: 100, longestDarkH: 40, earthPct: 50, powerIndex: 0.5, meanElLit: 1, landingOk: true },
    evaluation: { passes: {}, fails, score: 0 },
  })
  const date = (h: number) => `hour ${h}`
  it('is built from the finder result alone', () => {
    const f: FinderResult = { baseline: scored(0, 100, 1), results: [scored(1, 148, 0), scored(0, 200, 1)], evaluated: 3, ms: 1, planPassStart: 130 }
    const text = copilotSummary(f, [cand('plan', -89.9), cand('alt', -89.8)], date)
    expect(text).toMatch(/^The slipped plan fails 1 constraint; the same point passes if you land hour 130 UTC\./)
    expect(text).toMatch(/1 of 2 alternatives meet everything\. Best: alt, .* 2 days later/)
  })
  it('says when nothing in the slip range fixes the plan', () => {
    const f: FinderResult = { baseline: scored(0, 100, 2), results: [scored(1, 148, 1)], evaluated: 2, ms: 1, planPassStart: null }
    expect(copilotSummary(f, [cand('plan', -89.9), cand('alt', -89.8)], date)).toMatch(/no later date in the slip range fixes it.*None of the 1 alternatives/)
  })
  it('leads with the slip from the original date and what was searched, and names the earliest result', () => {
    const f: FinderResult = { baseline: scored(0, 100, 0), results: [scored(1, 136, 0)], evaluated: 2, ms: 1, planPassStart: 100 }
    const text = copilotSummary(f, [cand('plan', -89.9), cand('alt', -89.8)], date,
      { slip: { days: 11, fromMs: 0, toMs: 11 * 86_400_000 }, searched: "Shackleton rim's grid within 5 km, earliest date that meets everything first", order: 'earliest' },
      (ms) => `day ${ms / 86_400_000}`)
    expect(text).toMatch(/^Slipped 11 days from day 0 to day 11 UTC\. Searched Shackleton rim's grid within 5 km, earliest date that meets everything first\. /)
    expect(text).toMatch(/Earliest: alt, .*landing hour 136 UTC\./)
  })
})
