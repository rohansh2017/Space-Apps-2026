import { describe, expect, it } from 'vitest'
import type { Snapshot } from './onboarding'
import { COACH_STEPS, shouldAutoOpen } from './onboarding'

const base: Snapshot = { stageView: 'moon', moonZoom: false, offset: 0, playing: false, found: null }
const step = (id: string) => COACH_STEPS.find((s) => s.id === id)!
const done = (id: string, now: Partial<Snapshot>, start: Partial<Snapshot> = {}) => step(id).done!({ ...base, ...now }, { ...base, ...start })

describe('F28 quick tour steps', () => {
  it('is four actions and a closing card, each body one short sentence', () => {
    expect(COACH_STEPS.map((s) => s.id)).toEqual(['fly', 'sun', 'stand', 'find', 'end'])
    expect(COACH_STEPS.filter((s) => s.done)).toHaveLength(4)
    for (const s of COACH_STEPS) expect(s.body.split(/\s+/).length).toBeLessThanOrEqual(16)
  })
  it('advances on the action each step asks for', () => {
    expect(done('fly', {})).toBe(false)
    expect(done('fly', { moonZoom: true })).toBe(true)
    expect(done('sun', {})).toBe(false)
    expect(done('sun', { playing: true })).toBe(true)
    expect(done('sun', { offset: 5 })).toBe(true) // dragging the scrubber counts too
    expect(done('stand', { moonZoom: true })).toBe(false)
    expect(done('stand', { stageView: 'ground' })).toBe(true)
  })
  it('counts only a new search, not results already on screen', () => {
    const old = {}
    expect(done('find', { found: old }, { found: old })).toBe(false)
    expect(done('find', { found: {} }, { found: old })).toBe(true)
    expect(done('find', { found: null })).toBe(false)
  })
  it('a scrubber already moved before the step does not count', () => {
    expect(done('sun', { offset: 5 }, { offset: 5 })).toBe(false)
  })
})

describe('F28 when the quick tour opens by itself', () => {
  const p = (q: string) => new URLSearchParams(q)
  it('opens once, on a first visit to the bare address', () => {
    expect(shouldAutoOpen(p(''), false, false)).toBe(true)
    expect(shouldAutoOpen(p(''), true, false)).toBe(false) // done or dismissed before
  })
  it('stays shut for shared links and automated browsers', () => {
    expect(shouldAutoOpen(p('site=haworth&t=2026-12-01T00:00Z'), false, false)).toBe(false)
    expect(shouldAutoOpen(p('room=abc-123'), false, false)).toBe(false)
    expect(shouldAutoOpen(p(''), false, true)).toBe(false)
  })
  it('?tour=1 always opens it', () => {
    expect(shouldAutoOpen(p('tour=1'), true, true)).toBe(true)
  })
})
