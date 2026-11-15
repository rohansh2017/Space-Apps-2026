import { describe, expect, it } from 'vitest'
import schema from '../public/data/constraints.schema.json'
import type { ConstraintDef } from './data'
import { decodeShare, encodeShare, pickLocations, withStoredLocations } from './share'

const defs = schema.constraints as ConstraintDef[]
const defaults = Object.fromEntries(defs.map((d) => [d.id, d.default]))

describe('shareable URL', () => {
  it('round-trips site, point, time, changed constraints and mode, and keeps the room', () => {
    const p = encodeShare(new URLSearchParams('room=tb-abc123'), {
      site: 'connecting-ridge', point: 241, utc: '2026-12-01T00:00:00.000Z',
      constraints: { ...defaults, max_continuous_dark_hours: 60, landing_sun_and_earth_visible: false }, defs, mode: 'explorer',
    })
    expect(p.get('room')).toBe('tb-abc123')
    expect(p.toString()).toBe('room=tb-abc123&site=connecting-ridge&point=241&t=2026-12-01T00%3A00Z&c=max_continuous_dark_hours%3A60%2Clanding_sun_and_earth_visible%3Afalse&mode=explorer')
    const d = decodeShare(p)
    expect(d).toEqual({ site: 'connecting-ridge', point: 241, utc: '2026-12-01T00:00Z', constraints: { max_continuous_dark_hours: 60, landing_sun_and_earth_visible: false }, mode: 'explorer', pins: [] })
    expect(Date.parse(d.utc!)).toBe(Date.parse('2026-12-01T00:00:00Z'))
  })
  it('leaves defaults out and ignores junk', () => {
    const p = encodeShare(new URLSearchParams(), { site: 'haworth', point: null, utc: '2026-11-19T00:00:00.000Z', constraints: defaults, defs, mode: 'planner' })
    expect(p.toString()).toBe('site=haworth&t=2026-11-19T00%3A00Z')
    expect(decodeShare(new URLSearchParams('point=abc&t=yesterday&c=nonsense,:5&mode=god&pins=x,haworth:9@abc'))).toEqual({ constraints: {}, pins: [] })
  })
  it('round-trips pinned scenarios', () => {
    const pins = [{ point: 'change7-shackleton-rim:382', hour: 8112 }, { point: 'im2-mons-mouton:220', hour: 8064 }]
    const p = encodeShare(new URLSearchParams(), { site: 'haworth', point: null, utc: '2026-11-19T00:00:00.000Z', constraints: defaults, defs, mode: 'planner', pins })
    expect(p.get('pins')).toBe('change7-shackleton-rim:382@8112,im2-mons-mouton:220@8064')
    expect(decodeShare(p).pins).toEqual(pins)
  })
})

it('only locations are stored, and a link with its own site wins over them', () => {
  const p = new URLSearchParams('site=a&point=3&t=2026-12-01T00:00Z&c=x:1&mode=explorer&pins=a:1@5&room=tb-abc123')
  expect(pickLocations(p)).toBe('site=a&point=3&t=2026-12-01T00%3A00Z&pins=a%3A1%405')
  const stored = pickLocations(p)
  expect(decodeShare(withStoredLocations(new URLSearchParams(''), stored)).pins).toEqual([{ point: 'a:1', hour: 5 }])
  expect(withStoredLocations(new URLSearchParams('site=b'), stored).get('site')).toBe('b')
  expect(withStoredLocations(new URLSearchParams('room=tb-x'), stored).has('site')).toBe(false)
  expect(withStoredLocations(new URLSearchParams(''), null).toString()).toBe('')
})
