import { describe, expect, it } from 'vitest'
import schema from '../public/data/constraints.schema.json'
import { copilotSummary, isEmptyPlan, parseCopilot } from './copilot'
import type { ConstraintDef } from './data'
import type { Candidate, FinderResult, Scored } from './engine/finder'

const defs = schema.constraints as ConstraintDef[]
const sites = ['haworth', 'malapert-massif']

describe('F26 copilot reply validation', () => {
  it('keeps valid constraints, slip and site', () => {
    const p = parseCopilot(defs, sites, { constraints: { min_earth_visible_pct: 60, mission_duration_days: 10 }, slip_days: 21, site: 'haworth' })
    expect(p).toEqual({ values: { min_earth_visible_pct: 60, mission_duration_days: 10 }, rejected: [], slipDays: 21, site: 'haworth' })
  })
  it('names and drops an unknown site, an out-of-range slip and unknown keys, never coercing', () => {
    const p = parseCopilot(defs, sites, { constraints: { max_slope_deg: 99 }, slip_days: 45, site: 'tycho', fuel: 1 })
    expect(p.values).toEqual({})
    expect(p.slipDays).toBeNull()
    expect(p.site).toBeNull()
    expect(p.rejected.join(' ')).toMatch(/max_slope_deg = 99/)
    expect(p.rejected.join(' ')).toMatch(/slip_days = 45 \(outside 0–30 days\)/)
    expect(p.rejected.join(' ')).toMatch(/site = "tycho"/)
    expect(p.rejected.join(' ')).toMatch(/fuel \(unknown field\)/)
    expect(isEmptyPlan(p)).toBe(true)
  })
  it('rejects a non-object reply', () => {
    expect(parseCopilot(defs, sites, 'hello').rejected).toEqual(['reply is not an object'])
  })
})

describe('F26 copilot summary', () => {
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
})
