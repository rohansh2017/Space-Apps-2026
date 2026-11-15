import { describe, expect, it } from 'vitest'
import schema from '../public/data/constraints.schema.json'
import { copilotPrompt, groundPlan } from './copilot.js'

const defs = schema.constraints.filter((d) => d.id !== 'slip_range_days')

describe('F29 copilot grounding (Worker)', () => {
  const sentence = 'My mission slipped by 11 days. Stay near the rim, and we need Earth half the time.'
  it('keeps slip, where, when and constraints whose quotes are the user\'s words', () => {
    const p = groundPlan({
      slip: { days: 11, quote: 'slipped by 11 days' },
      where: { scope: 'current', quote: 'stay near the rim' },
      constraints: [{ quote: 'Earth half the time', field: 'min_earth_visible_pct', value: 50 }],
    }, sentence, defs)
    expect(p).toEqual({
      slip: { days: 11, quote: 'slipped by 11 days' },
      where: { scope: 'current', quote: 'stay near the rim' },
      constraints: { min_earth_visible_pct: 50 },
    })
  })
  it('drops a part whose quote is not in the sentence', () => {
    const p = groundPlan({ when: { order: 'earliest', quote: 'as soon as possible' }, where: { scope: 'all', quote: 'anywhere' } }, sentence, defs)
    expect(p.when).toBeUndefined()
    expect(p.where).toBeUndefined()
  })
  it('never lets one phrase mean two things: the slip wins over a window or a constraint on the same words', () => {
    const p = groundPlan({
      slip: { days: 11, quote: 'slipped by 11 days' },
      when: { window_days: 11, quote: '11 days' },
      constraints: [{ quote: '11 days', field: 'mission_duration_days', value: 11 }],
    }, sentence, defs)
    expect(p.slip.days).toBe(11)
    expect(p.when).toBeUndefined()
    expect(p.constraints).toEqual({})
  })
  it('names the current site and plan date in the prompt, and never offers slip_range_days', () => {
    const sites = [{ id: 'change7-shackleton-rim', name: 'Shackleton rim' }, { id: 'haworth', name: 'Haworth' }]
    const text = copilotPrompt('x', sites, sites[0], '2026-12-03T14:00:00.000Z')
    expect(text).toContain('Current plan: Shackleton rim (change7-shackleton-rim), landing 2026-12-03T14:00:00.000Z UTC')
    expect(text).not.toContain('slip_range_days')
  })
})
