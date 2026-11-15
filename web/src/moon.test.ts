import { describe, expect, it } from 'vitest'
import engineCases from '../../shared/fixtures/engine_cases.json'
import fixture from '../../shared/fixtures/metrics_cases.json'
import pointsFile from '../public/data/points.json'
import type { Constraints } from './engine/engine'
import { buildSeries, evaluate, latLonToXY, siteFrame, snapToGrid, windowMetrics } from './engine/engine'
import type { Vec3 } from './moon'
import { flyPose, gridIndex, latLonToMe, meToLatLon, meToThree, meToXY, pickGrid, raySphere, threeToMe, verdict, xyToMe } from './moon'

const points = pointsFile.points
const region = points.filter((p) => p.region === 'change7-shackleton-rim')
const centre = region[220]

describe('MOON_ME and three.js axes', () => {
  it('round-trips and keeps handedness', () => {
    const v: Vec3 = [0.3, -0.5, 0.81]
    expect(threeToMe(meToThree(v))).toEqual(v)
    expect(meToThree(threeToMe(v))).toEqual(v)
    // a proper rotation: x cross y = z still holds after the change of axes
    const [x, y, z] = [meToThree([1, 0, 0]), meToThree([0, 1, 0]), meToThree([0, 0, 1])]
    const cross = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]]
    cross.forEach((c, i) => expect(c).toBeCloseTo(z[i], 12)) // toBeCloseTo: -0 and 0 are the same axis
    expect(meToThree([0, 0, -1])[1]).toBe(-1) // the south pole is straight down in three.js
  })
})

describe('stereographic projection without trigonometry', () => {
  it('matches latlon_to_xy for points.json (centimetres)', () => {
    for (const p of [region[0], region[20], centre, region[440], points[points.length - 1], points[5000 % points.length]]) {
      const [x, y] = meToXY(latLonToMe(p.lat, p.lon))
      // points.json rounds lat/lon to 1e-6 deg (about 3 cm on the ground)
      expect(Math.abs(x - p.x)).toBeLessThan(0.1)
      expect(Math.abs(y - p.y)).toBeLessThan(0.1)
    }
  })
  it('matches the engine for the Shackleton rim site and inverts exactly', () => {
    const [x, y] = meToXY(latLonToMe(-88.8, 123.4))
    const [ex, ey] = latLonToXY(-88.8, 123.4)
    expect(x).toBeCloseTo(ex, 5)
    expect(y).toBeCloseTo(ey, 5)
    expect(Math.round(x)).toBe(30380)
    expect(Math.round(y)).toBe(-20032)
    const me = xyToMe(x, y)
    expect(Math.hypot(...me)).toBeCloseTo(1, 12)
    const [lat, lon] = meToLatLon(me)
    expect(lat).toBeCloseTo(-88.8, 9)
    expect(lon).toBeCloseTo(123.4, 9)
  })
})

describe('ray pick to grid index', () => {
  /** A ray from 30 km above the Moon, straight down onto a stereographic position. */
  const rayTo = (x: number, y: number): [Vec3, Vec3] => {
    const p = meToThree(xyToMe(x, y))
    return [[p[0] * 1.02, p[1] * 1.02, p[2] * 1.02], [-p[0], -p[1], -p[2]]]
  }
  it('hits the exact unit sphere, and misses when aimed away', () => {
    const hit = raySphere([0, -3, 0], [0, 1, 0])!
    expect(hit).toEqual([0, -1, 0])
    expect(raySphere([0, -3, 0], [1, 0, 0])).toBeNull()
    expect(raySphere([0, -3, 0], [0, -1, 0])).toBeNull()
  })
  it('centre is 220, the first corner is 0, and a 200 m offset still rounds to the same point', () => {
    expect(pickGrid(...rayTo(centre.x, centre.y), centre.x, centre.y)).toMatchObject({ index: 220, outside: false })
    expect(pickGrid(...rayTo(region[0].x, region[0].y), centre.x, centre.y)).toMatchObject({ index: 0, outside: false })
    expect(pickGrid(...rayTo(region[440].x + 200, region[440].y - 200), centre.x, centre.y)).toMatchObject({ index: 440, outside: false })
    expect(pickGrid(...rayTo(region[37].x + 240, region[37].y + 240), centre.x, centre.y)!.index).toBe(37)
  })
  it('outside the grid keeps the nearest edge point and says so', () => {
    const out = pickGrid(...rayTo(centre.x + 9000, centre.y + 1000), centre.x, centre.y)!
    expect(out.outside).toBe(true)
    expect(out.index).toBe(12 * 21 + 20) // east edge, two rows above the middle
    expect(gridIndex(centre.x - 99999, centre.y - 99999, centre.x, centre.y)).toEqual({ index: 0, outside: true })
  })
  it('agrees with the engine snapToGrid, the path the app commits picks through', () => {
    for (const [dx, dy] of [[130, -220], [-2760, 4420], [4990, -4990], [7000, 300]]) {
      const pick = pickGrid(...rayTo(centre.x + dx, centre.y + dy), centre.x, centre.y)!
      expect(snapToGrid(region, pick.lat, pick.lon).point.index).toBe(pick.index)
    }
  })
  it('a miss is null', () => {
    expect(pickGrid([0, -3, 0], [1, 0, 0], centre.x, centre.y)).toBeNull()
  })
})

describe('pin verdict', () => {
  const lenient: Constraints = { ...fixture.constraints.default, mission_duration_days: 1, min_continuous_sun_days: 0, max_continuous_dark_hours: 720, min_earth_visible_pct: 0, landing_sun_and_earth_visible: false, max_slope_deg: 30 }
  const steep: Constraints = { ...lenient, max_slope_deg: 5 }
  it('equals evaluate() on the engine metrics for each engine fixture case: solid when it passes, hollow when it fails', () => {
    for (const c of engineCases.cases) {
      const table = c.rows.flat()
      const frame = siteFrame(c.site.lat, c.site.lon, c.site.elev_m)
      for (const [con, hour] of [[lenient, 0], [steep, 0], [{ ...fixture.constraints.default, mission_duration_days: 1, min_continuous_sun_days: 1 } as Constraints, 24]] as const) {
        const metrics = windowMetrics(buildSeries(table, hour, 24, frame, c.mask_raw, 1), 0, 24)
        const v = verdict(table, c.rows.length, hour, frame, c.mask_raw, 8, con)!
        expect(v.metrics).toEqual(metrics)
        expect(v.evaluation).toEqual(evaluate(metrics, 8, con))
      }
      expect(verdict(table, c.rows.length, 0, frame, c.mask_raw, 8, lenient)!.evaluation.fails).toBe(0)
      expect(verdict(table, c.rows.length, 0, frame, c.mask_raw, 8, steep)!.evaluation.passes.max_slope_deg).toBe(false)
      // the mission window runs past the table: no verdict rather than a wrong one
      expect(verdict(table, c.rows.length, 30, frame, c.mask_raw, 8, lenient)).toBeNull()
    }
  })
})

describe('fly-down pose', () => {
  it('starts and ends on the given poses, with the altitude geometric in between', () => {
    const [a, b]: Vec3[] = [[0, -1, 0], meToThree(latLonToMe(-88.8, 123.4))]
    expect(Math.hypot(...flyPose(a, 0.5, b, 0.005, 0))).toBeCloseTo(1.5, 12)
    expect(Math.hypot(...flyPose(a, 0.5, b, 0.005, 1))).toBeCloseTo(1.005, 12)
    expect(Math.hypot(...flyPose(a, 0.5, b, 0.005, 0.5)) - 1).toBeCloseTo(0.05, 12)
  })
})
