import { describe, expect, it } from 'vitest'
import schema from '../public/data/constraints.schema.json'
import type { ConstraintDef } from './data'
import { decodeShare, encodeShare, pickLocations, withStoredLocations } from './share'

const defs = schema.constraints as ConstraintDef[]
const defaults = Object.fromEntries(defs.map((d) => [d.id, d.default]))

describe('shareable URL', () => {
  it('round-trips site, point, time, changed constraints, and keeps the room', () => {
    const p = encodeShare(new URLSearchParams('room=tb-abc123'), {
      site: 'connecting-ridge', point: 241, utc: '2026-12-01T00:00:00.000Z',
      constraints: { ...defaults, max_continuous_dark_hours: 60, landing_sun_and_earth_visible: false }, defs,
    })
    expect(p.get('room')).toBe('tb-abc123')
    expect(p.toString()).toBe('room=tb-abc123&site=connecting-ridge&point=241&t=2026-12-01T00%3A00Z&c=max_continuous_dark_hours%3A60%2Clanding_sun_and_earth_visible%3Afalse')
    const d = decodeShare(p)
    expect(d).toEqual({ site: 'connecting-ridge', point: 241, utc: '2026-12-01T00:00Z', constraints: { max_continuous_dark_hours: 60, landing_sun_and_earth_visible: false }, pins: [], planInTray: false })
    expect(Date.parse(d.utc!)).toBe(Date.parse('2026-12-01T00:00:00Z'))
  })
  it('drops the retired mode parameter from old links (D77)', () => {
    const p = encodeShare(new URLSearchParams('mode=explorer'), { site: 'haworth', point: null, utc: '2026-11-19T00:00:00.000Z', constraints: defaults, defs })
    expect(p.has('mode')).toBe(false)
  })
  it('leaves defaults out and ignores junk', () => {
    const p = encodeShare(new URLSearchParams(), { site: 'haworth', point: null, utc: '2026-11-19T00:00:00.000Z', constraints: defaults, defs })
    expect(p.toString()).toBe('site=haworth&t=2026-11-19T00%3A00Z')
    expect(decodeShare(new URLSearchParams('point=abc&t=yesterday&c=nonsense,:5&mode=god&pins=x,haworth:9@abc&ref=x'))).toEqual({ constraints: {}, pins: [], planInTray: false })
  })
  it('round-trips pinned scenarios', () => {
    const pins = [{ point: 'change7-shackleton-rim:382', hour: 8112 }, { point: 'im2-mons-mouton:220', hour: 8064 }]
    const p = encodeShare(new URLSearchParams(), { site: 'haworth', point: null, utc: '2026-11-19T00:00:00.000Z', constraints: defaults, defs, pins })
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

it('round-trips the baseline; a legacy live-plan column still decodes, and is never written', () => {
  const defs = [] as never[]
  const p = encodeShare(new URLSearchParams(), { site: 'haworth', point: null, utc: '2026-11-19T00:00:00.000Z', constraints: {}, defs,
    pins: [{ point: 'haworth:3', hour: 7 }], ref: 'haworth:3@7' })
  expect(p.get('pins')).toBe('haworth:3@7')
  expect(decodeShare(p).ref).toBe('haworth:3@7')
  // links and stored locations from D56/D57: the app turns "plan" into a snapshot of the plan (D59)
  const old = decodeShare(new URLSearchParams('pins=plan,haworth:3@7&ref=plan'))
  expect([old.planInTray, old.pins, old.ref]).toEqual([true, [{ point: 'haworth:3', hour: 7 }], 'plan'])
})
