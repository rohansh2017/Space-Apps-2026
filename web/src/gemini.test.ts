import { describe, expect, it } from 'vitest'
import schema from '../public/data/constraints.schema.json'
import type { ConstraintDef } from './data'
import { parseSuggestion } from './gemini'

const defs = schema.constraints as ConstraintDef[]

describe('Gemini reply validation', () => {
  it('keeps schema-valid fields and names everything it rejects', () => {
    const s = parseSuggestion(defs, { max_continuous_dark_hours: 96, min_earth_visible_pct: 50, landing_sun_and_earth_visible: false })
    expect(s.values).toEqual({ max_continuous_dark_hours: 96, min_earth_visible_pct: 50, landing_sun_and_earth_visible: false })
    expect(s.rejected).toEqual([])
  })
  it('rejects unknown fields, out-of-range values and wrong types, without coercing', () => {
    const s = parseSuggestion(defs, { mission_duration_days: 999, max_slope_deg: '8', fuel_kg: 10, landing_sun_and_earth_visible: 'yes', min_earth_visible_pct: 40 })
    expect(s.values).toEqual({ min_earth_visible_pct: 40 })
    expect(s.rejected).toHaveLength(4)
    expect(s.rejected.join(' ')).toMatch(/mission_duration_days = 999 \(outside 1–30 days\)/)
    expect(s.rejected.join(' ')).toMatch(/fuel_kg \(unknown field\)/)
  })
  it('rejects a non-object reply', () => {
    expect(parseSuggestion(defs, [1, 2]).rejected).toEqual(['reply is not an object'])
    expect(parseSuggestion(defs, null).values).toEqual({})
  })
})
