import { describe, expect, it } from 'vitest'
import { starColour } from './starfield'

describe('star colour from B-V', () => {
  it('runs from blue-white through white to orange', () => {
    const [hot, sun, cool] = [starColour(-0.3), starColour(0.65), starColour(1.6)]
    expect(hot[2]).toBeGreaterThanOrEqual(hot[0]) // B stars: blue at least as strong as red
    expect(sun[0]).toBe(1) // a Sun-like star (about 5,800 K) is near white with full red
    expect(sun[2]).toBeGreaterThan(0.8)
    expect(cool[0]).toBe(1) // M stars: red full, blue weak
    expect(cool[2]).toBeLessThan(0.6)
    expect(starColour(Number.NaN)).toEqual([1, 1, 1])
  })
})
