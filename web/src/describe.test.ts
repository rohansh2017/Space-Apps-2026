import { describe, expect, it } from 'vitest'
import { horizonFacts, numbersCheck, templateDescription } from './describe'
import { prepare } from './engine/engine'

const mask = new Uint16Array(360).fill(1000) // 0 deg
mask[45] = 1400 // 4 deg toward the north-east
mask[270] = 900 // -1 deg toward the west
const series = prepare([1, 1, 0.5, 0, 0, 0, 1, 1, 1, 1], [1, 1, 1, 1, 0, 0, 0, 1, 1, 1], [1, 1.5, 2, 1, 0.5, 0.2, 0.8, 1.2, 1.1, 1])

describe('horizon description', () => {
  const f = horizonFacts(mask, series, 0, 8)
  it('derives the facts from the mask and the series', () => {
    expect(f).toMatchObject({
      ridge_direction: 'north-east', ridge_elevation_deg: 4, lowest_direction: 'west', lowest_elevation_deg: -1,
      window_hours: 8, sunlit_pct: Math.round((1 + 1 + 0.5 + 1 + 1) / 8 * 100), sun_max_elevation_deg: 2,
      sun_now: 'up', hours_to_sun_change: 3, earth_now: 'visible', hours_to_earth_change: 4,
    })
  })
  it('writes a template sentence that passes its own number check', () => {
    const text = templateDescription(f)
    expect(text).toContain('highest toward the north-east, 4° up')
    expect(text).toContain('sets in 3 hours')
    expect(numbersCheck(text, f)).toBe(true)
  })
  it('rejects text with a number that is not a fact', () => {
    expect(numbersCheck('The ridge rises 4° to the north-east; sunset in 3 hours.', f)).toBe(true)
    expect(numbersCheck('Sunset in about 0.1 days.', f)).toBe(true) // 3 h rounded to a tenth of a day
    expect(numbersCheck('The ridge rises 12° to the north-east.', f)).toBe(false)
    expect(numbersCheck('Expect 61 hours of darkness.', f)).toBe(false)
  })
  it('handles a dark start and no change within the series', () => {
    const d = horizonFacts(null, prepare([0, 0, 0], [0, 0, 0], [-1, -1, -1]), 0, 3)
    expect(d.sun_now).toBe('down')
    expect(d.hours_to_sun_change).toBeNull()
    expect(templateDescription(d)).toContain('rises in more than 30 days')
  })
})
