import { describe, expect, it } from 'vitest'
import { horizonFacts, looksLikeDescription, numbersCheck, templateDescription } from './describe'
import { prepare } from './engine/engine'

const mask = new Uint16Array(360).fill(1000) // 0 deg
mask[45] = 1400 // 4 deg toward the north-east
mask[270] = 900 // -1 deg toward the west
// Sun crossing from east to north-east while Earth sits north
const track = Array.from({ length: 10 }, (_, i) => ({ sunAz: 90 - i * 5, sunEl: 1, earthAz: 0, earthEl: 2 }))
const series = prepare([1, 1, 0.5, 0, 0, 0, 1, 1, 1, 1], [1, 1, 1, 1, 0, 0, 0, 1, 1, 1], [1, 1.5, 2, 1, 0.5, 0.2, 0.8, 1.2, 1.1, 1])

describe('horizon description', () => {
  const f = horizonFacts(mask, series, track, 0, 8)
  it('derives the facts from the mask and the series', () => {
    expect(f).toMatchObject({
      ridge_direction: 'north-east', ridge_elevation_deg: 4, lowest_direction: 'west', lowest_elevation_deg: -1,
      window_hours: 8, sunlit_pct: Math.round((1 + 1 + 0.5 + 1 + 1) / 8 * 100), sun_max_elevation_deg: 2,
      sun_now: 'up', sun_direction: 'east', hours_to_sun_change: 3, sun_change_direction: 'east',
      earth_now: 'visible', earth_direction: 'north', hours_to_earth_change: 4, earth_change_direction: 'north',
    })
  })
  it('writes a template sentence that passes its own number check', () => {
    const text = templateDescription(f)
    expect(text).toContain('highest toward the north-east, 4° up')
    expect(text).toContain('sets in 3 hours toward the east')
    expect(numbersCheck(text, f)).toBe(true)
  })
  it('rejects text with a number that is not a fact', () => {
    expect(numbersCheck('The ridge rises 4° to the north-east; sunset in 3 hours.', f)).toBe(true)
    expect(numbersCheck('Sunset in about 0.1 days.', f)).toBe(true) // 3 h rounded to a tenth of a day
    expect(numbersCheck('The ridge rises 12° to the north-east.', f)).toBe(false)
    expect(numbersCheck('Expect 61 hours of darkness.', f)).toBe(false)
  })
  it('handles a dark start and no change within the series', () => {
    const d = horizonFacts(null, prepare([0, 0, 0], [0, 0, 0], [-1, -1, -1]), [], 0, 3)
    expect(d.sun_now).toBe('down')
    expect(d.hours_to_sun_change).toBeNull()
    expect(templateDescription(d)).toContain('rises in more than 30 days')
  })
  it('tells a description from a refusal', () => {
    expect(looksLikeDescription('The skyline peaks to the north-east and the Sun sets behind it in 3 hours.')).toBe(true)
    expect(looksLikeDescription('This task cannot be completed as specified because the facts do not contain that information.')).toBe(false)
    expect(looksLikeDescription('OK.')).toBe(false)
  })
})
