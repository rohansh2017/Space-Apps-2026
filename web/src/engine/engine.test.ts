import { describe, expect, it } from 'vitest'
import fixture from '../../../shared/fixtures/engine_cases.json'
import { buildSeries, earthVisible, maskAt, siteAngles, siteFrame, sunFraction } from './engine'

// Parity with the Python reference engine: angles within 1e-4 deg, visibility identical.
describe('engine parity with horizonwalk.engine', () => {
  it.each(fixture.cases.map((c, i) => [i, c] as const))('case %i', (_, c) => {
    const frame = siteFrame(c.site.lat, c.site.lon, c.site.elev_m)
    const table = c.rows.flat()
    c.rows.forEach((_row, r) => {
      const a = siteAngles(table, r, frame)
      const sunMask = maskAt(c.mask_raw, a.sunAz)
      const earthMask = maskAt(c.mask_raw, a.earthAz)
      expect(Math.abs(a.sunAz - c.expect.sun_az[r])).toBeLessThan(1e-4)
      expect(Math.abs(a.sunEl - c.expect.sun_el[r])).toBeLessThan(1e-4)
      expect(Math.abs(a.earthAz - c.expect.earth_az[r])).toBeLessThan(1e-4)
      expect(Math.abs(a.earthEl - c.expect.earth_el[r])).toBeLessThan(1e-4)
      expect(Math.abs(sunMask - c.expect.sun_mask[r])).toBeLessThan(1e-4)
      expect(Math.abs(earthMask - c.expect.earth_mask[r])).toBeLessThan(1e-4)
      expect(sunFraction(a.sunEl, sunMask)).toBeCloseTo(c.expect.sun_fraction[r], 9)
      expect(earthVisible(a.earthEl, earthMask)).toBe(c.expect.earth_visible[r])
    })
  })
})

describe('buildSeries (inlined hot loop)', () => {
  it.each(fixture.cases.map((c, i) => [i, c] as const))('matches the reference functions, case %i', (_, c) => {
    const p = buildSeries(c.rows.flat(), 0, c.rows.length, siteFrame(c.site.lat, c.site.lon, c.site.elev_m), c.mask_raw)
    c.rows.forEach((_row, r) => {
      expect(p.sunEl[r]).toBeCloseTo(c.expect.sun_el[r], 9)
      expect(p.frac[r]).toBeCloseTo(c.expect.sun_fraction[r], 9)
      expect(p.earth[r] === 1).toBe(c.expect.earth_visible[r])
    })
  })
})

describe('engine units', () => {
  it('interpolates the mask and wraps at 360', () => {
    const mask = new Array(360).fill(1000) // 0 deg
    mask[10] = 1200
    mask[11] = 1400
    mask[359] = 1100
    mask[0] = 1300
    expect(maskAt(mask, 10.25)).toBeCloseTo(2.5, 12)
    expect(maskAt(mask, 359.5)).toBeCloseTo(2, 12)
    expect(maskAt(mask, -0.5)).toBeCloseTo(2, 12)
  })
  it('gives a partial solar disk', () => {
    expect(sunFraction(1, 0)).toBe(1)
    expect(sunFraction(-1, 0)).toBe(0)
    expect(sunFraction(0, 0)).toBeCloseTo(0.5, 12)
    expect(sunFraction(0.1, 0) + sunFraction(-0.1, 0)).toBeCloseTo(1, 12)
  })
  it('needs 1 deg of clearance for Earth', () => {
    expect(earthVisible(3, 2)).toBe(true)
    expect(earthVisible(2.99, 2)).toBe(false)
  })
})
