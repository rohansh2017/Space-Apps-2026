import { describe, expect, it } from 'vitest'
import type { Relaxation } from './engine/finder'
import { looksLikeWhyNot, whyNotFacts, whyNotNumbersOk, whyNotText } from './whynot'

const relax: Relaxation[] = [
  { id: 'max_continuous_dark_hours', actual: 112, limit: 80, needed: 112 },
  { id: 'min_earth_visible_pct', actual: 31, limit: 40, needed: 31 },
]

describe('F27 why not', () => {
  it('says what fails and what would pass, from the engine facts alone', () => {
    const f = whyNotFacts(relax, 96)
    expect(whyNotText(f)).toBe('Fails on longest darkness (112 h, limit 80 h), Earth visibility (31%, limit 40%). '
      + 'Passes if you allow 112 h of darkness and 31% Earth visibility, or if you land 4 days later at the same point.')
    expect(whyNotText(whyNotFacts(relax, null))).not.toMatch(/later/)
    expect(whyNotText(whyNotFacts([{ id: 'landing_sun_and_earth_visible', actual: false, limit: true, needed: false }], 5)))
      .toBe('Fails on Sun and Earth visible at touchdown. Passes if you drop the touchdown Sun-and-Earth check, or if you land 5 h later at the same point.')
    expect(whyNotText(whyNotFacts([], null))).toBe('')
  })
  it('keeps Gemini wording only when every number is a fact', () => {
    const f = whyNotFacts(relax, 96)
    expect(whyNotNumbersOk('Darkness lasts 112 h against an 80 h limit; landing 4 days later fixes it.', f)).toBe(true)
    expect(whyNotNumbersOk('Darkness lasts 120 h; land 3 days later.', f)).toBe(false)
    expect(looksLikeWhyNot('I cannot answer that from the facts given here, sorry.')).toBe(false)
    expect(looksLikeWhyNot('The plan fails on darkness; allow 112 h or land 4 days later.')).toBe(true)
  })
})
