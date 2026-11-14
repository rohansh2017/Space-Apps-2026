import { describe, expect, it } from 'vitest'
import fixture from '../../../shared/fixtures/orientation_cases.json'
import { quatRotate, siteAngles, siteFrame, skyAzEl, skyMatrix } from './engine'

// The orientation table is right if it turns Skyfield's apparent ICRF Sun onto the stored MOON_ME Sun.
describe('ICRF -> MOON_ME orientation table', () => {
  it.each(fixture.cases.map((c) => [`${c.year} h${c.hour}`, c] as const))('%s', (_, c) => {
    const q = Float32Array.from(c.q) // as the browser stores it
    const me = quatRotate(q, 0, c.sun_icrf as [number, number, number])
    // atan2(|a x b|, a . b): acos of a dot product near 1 would turn Float32 length noise into a fake 0.005 deg
    const [a, b] = [me, c.row]
    const cross = Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])
    const err = Math.atan2(cross, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * (180 / Math.PI)
    expect(err).toBeLessThan(1e-4) // degrees; Float32 storage limits it to about 1e-5
    // and through a site frame, the same az/el the engine gives the Sun from the ephemeris row
    for (const [lat, lon] of [[-88.8, 123.4], [-84.78, 29.13], [0.67, 23.47]]) {
      const f = siteFrame(lat, lon, 0)
      const [az, el] = skyAzEl(skyMatrix(q, 0, f), c.sun_icrf as [number, number, number])
      const a = siteAngles(c.row, 0, f)
      expect(Math.abs(el - a.sunEl)).toBeLessThan(1e-3)
      expect(Math.abs((((az - a.sunAz) % 360) + 540) % 360 - 180) * Math.cos((el * Math.PI) / 180)).toBeLessThan(1e-3)
    }
  })
  it('rotates by an identity quaternion without change', () => {
    expect(quatRotate([1, 0, 0, 0], 0, [0.3, -0.4, 0.866])).toEqual([0.3, -0.4, 0.866])
  })
})
