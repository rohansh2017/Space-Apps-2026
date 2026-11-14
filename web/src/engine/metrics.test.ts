import { describe, expect, it } from 'vitest'
import fixture from '../../../shared/fixtures/metrics_cases.json'
import type { Constraints } from './engine'
import { evaluate, latLonToXY, nextChange, prepare, snapToGrid, windowMetrics } from './engine'

// Parity with horizonwalk.engine: integer metrics and pass/fail identical, floats to 1e-9.
describe('metrics parity with horizonwalk.engine', () => {
  fixture.cases.forEach((c, i) => {
    it(`series ${i}: window metrics and constraint evaluation`, () => {
      for (const w of c.windows) {
        const m = windowMetrics(prepare(c.frac, c.earth, c.sun_el, w.deck), w.start, w.hours)
        expect(m.longestLitH).toBe(w.metrics.longest_lit_h)
        expect(m.longestDarkH).toBe(w.metrics.longest_dark_h)
        expect(m.landingOk).toBe(w.metrics.landing_ok)
        expect(m.sunlitPct).toBeCloseTo(w.metrics.sunlit_pct, 9)
        expect(m.earthPct).toBeCloseTo(w.metrics.earth_pct, 9)
        expect(m.powerIndex).toBeCloseTo(w.metrics.power_index, 9)
        if (w.metrics.mean_el_lit === null) expect(m.meanElLit).toBeNull()
        else expect(m.meanElLit).toBeCloseTo(w.metrics.mean_el_lit, 9)
        for (const kind of ['default', 'strict'] as const) {
          const e = evaluate(m, fixture.slopes[kind], fixture.constraints[kind] as Constraints)
          expect(e.passes).toEqual(w[kind].passes)
          expect(e.fails).toBe(w[kind].fails)
          expect(e.score).toBeCloseTo(w[kind].score, 9)
        }
      }
    })
    it(`series ${i}: next sunset/sunrise and Earthset/Earthrise`, () => {
      const p = prepare(c.frac, c.earth, c.sun_el)
      for (const ev of c.events) {
        expect(nextChange(p.litLeft, ev.t)).toBe(ev.sun)
        expect(nextChange(p.earthLeft, ev.t)).toBe(ev.earth)
      }
    })
  })
})

describe('run lengths and events', () => {
  const p = prepare([1, 1, 0.5, 0, 0, 0, 1, 0, 1, 1], [1, 0, 0, 1, 1, 1, 1, 1, 0, 0], new Array(10).fill(0))
  it('clips runs to the window', () => {
    expect(windowMetrics(p, 0, 10)).toMatchObject({ longestLitH: 3, longestDarkH: 3, landingOk: true })
    expect(windowMetrics(p, 3, 4)).toMatchObject({ longestLitH: 1, longestDarkH: 3, landingOk: false })
    expect(() => windowMetrics(p, 5, 6)).toThrow(RangeError)
  })
  it('finds the next change or reports none', () => {
    expect(nextChange(p.litLeft, 0)).toBe(3)
    expect(nextChange(p.litLeft, 3)).toBe(3)
    expect(nextChange(p.litLeft, 8)).toBeNull()
  })
})

describe('grid snapping', () => {
  it('snaps to the nearest point and reports the distance', () => {
    const points = [[-88.8, 123.4], [-88.81, 123.4], [-88.8, 124.4]].map(([lat, lon]) => {
      const [x, y] = latLonToXY(lat, lon)
      return { lat, lon, x, y }
    })
    const { point, distanceM } = snapToGrid(points, -88.808, 123.4)
    expect(point).toBe(points[1])
    expect(distanceM).toBeGreaterThan(55) // 0.002 deg of latitude is about 61 m
    expect(distanceM).toBeLessThan(65)
    expect(snapToGrid(points, -88.8, 123.4).distanceM).toBeLessThan(1e-6)
  })
})
