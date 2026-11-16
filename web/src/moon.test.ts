import { describe, expect, it } from 'vitest'
import engineCases from '../../shared/fixtures/engine_cases.json'
import fixture from '../../shared/fixtures/metrics_cases.json'
import pointsFile from '../public/data/points.json'
import type { Constraints } from './engine/engine'
import { R_MOON_KM, buildSeries, evaluate, latLonToXY, quatRotate, siteFrame, snapToGrid, windowMetrics } from './engine/engine'
import type { Vec3 } from './moon'
import type { ReliefGrid } from './moon'
import { bearingTo, contourInterval, flyPose, globeUV, gridHeight, icrfToThree, gridIndex, latLonToMe, meToLatLon, meToThree, meToXY, packRG8, pickGrid, raySphere, rayRelief, reliefAt, siteHillshade, siteUV, threeToMe, verdict, xyToMe } from './moon'

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

describe('whole-Moon and site texture coordinates', () => {
  it('maps the equirectangular globe: 0°E at u = 0, 90°E at u = 0.25, the south pole at v = 0', () => {
    expect(globeUV(latLonToMe(0, 0))[0]).toBeCloseTo(0, 12)
    expect(globeUV(latLonToMe(0, 90))).toEqual([expect.closeTo(0.25, 12), expect.closeTo(0.5, 12)])
    expect(globeUV(latLonToMe(0, -90))[0]).toBeCloseTo(0.75, 12)
    expect(globeUV(latLonToMe(-90, 0))[1]).toBeCloseTo(0, 12)
    expect(globeUV(latLonToMe(45, 10))[1]).toBeCloseTo(0.75, 12)
  })
  it('maps a site heightmap: the site at its centre texel, and 1 km east/north to the right texels', () => {
    const f = siteFrame(-88.8, 123.4, 0)
    const n = 1024
    const span = 5000
    const [u, v] = siteUV(latLonToMe(-88.8, 123.4), f, n, span)
    expect(u).toBeCloseTo(0.5, 6)
    expect(v).toBeCloseTo(0.5, 6)
    const step = (dir: number[], km: number) => {
      const p = f.up.map((x, i) => x + (dir[i] * km) / R_MOON_KM)
      const len = Math.hypot(...p)
      return siteUV(p.map((x) => x / len) as Vec3, f, n, span)
    }
    const cell = span / (n - 1)
    expect(step(f.east, 1)[0] - u).toBeCloseTo(1000 / cell / n, 4) // east is +u
    expect(step(f.north, 1)[1] - v).toBeCloseTo(-1000 / cell / n, 4) // north is up the image: row 0
  })
  it('shades flat ground like the basemaps, and a slope facing the light brighter', () => {
    const flat = siteHillshade(new Float32Array(9), 3, 5, 1, 0)
    expect(flat[4]).toBe(Math.round(Math.sin((35 * Math.PI) / 180) * 255))
    // at 0°E the light is from the north-west; ground rising to the south-east faces it
    const hm = Float32Array.from({ length: 9 }, (_, k) => (k % 3) * 5 + Math.floor(k / 3) * 5) // rises east and south
    expect(siteHillshade(hm, 3, 5, 1, 0)[4]).toBeGreaterThan(flat[4])
  })
})

describe('star field on the Moon view', () => {
  it('rotates ICRF into three.js axes exactly as quatRotate then meToThree', () => {
    const q = [0.5, 0.5, -0.5, 0.5].map((x, i) => x + [0.1, 0, 0.05, -0.02][i]).map((x, _, a) => x / Math.hypot(...a)) // a unit quaternion
    const m = icrfToThree([0, 0, 0, 0, ...q], 1)
    for (const v of [[1, 0, 0], [0.3, -0.4, 0.866], [0, 0, 1]] as Vec3[]) {
      const want = meToThree(quatRotate(q, 0, v))
      const got = [0, 3, 6].map((r) => m[r] * v[0] + m[r + 1] * v[1] + m[r + 2] * v[2])
      got.forEach((g, i) => expect(g).toBeCloseTo(want[i], 12))
    }
  })
})

describe('relief grids (D67)', () => {
  const R_M = R_MOON_KM * 1000
  // a 4 x 4 stereographic grid over +-2 km around (cx, cy); value = 100 x row + col, so every pixel centre is known
  const [cx, cy] = latLonToXY(centre.lat, centre.lon)
  const stereo: ReliefGrid = { kind: 'stereo', values: Uint16Array.from({ length: 16 }, (_, k) => 100 * Math.floor(k / 4) + (k % 4)), n: 4, cx, cy, half: 2000, offset: -50, scale: 2 }
  const pixel = (col: number, row: number) => xyToMe(cx - 2000 + (col + 0.5) * 1000, cy + 2000 - (row + 0.5) * 1000) // row 0 = +y, col 0 = -x

  it('reads a stereographic grid at its pixel centres, interpolates between them, and is null outside', () => {
    expect(gridHeight(stereo, pixel(1, 2))).toBeCloseTo(-50 + 2 * 201, 6)
    expect(gridHeight(stereo, pixel(3, 0))).toBeCloseTo(-50 + 2 * 3, 6)
    expect(gridHeight(stereo, xyToMe(cx - 500, cy))).toBeCloseTo(-50 + 2 * (150 + 1), 6) // half-way between rows 1, 2 at col 1
    expect(gridHeight(stereo, xyToMe(cx + 2100, cy))).toBeNull()
  })

  it('reads the equirectangular globe: col 0 = 0°E, row 0 = 90°N, wrapping in longitude', () => {
    const globe: ReliefGrid = { kind: 'globe', values: Uint16Array.from({ length: 8 * 4 }, (_, k) => k), w: 8, h: 4, offset: 0, scale: 1 }
    // pixel centres at 22.5°E + 45° x col, 67.5°N - 45° x row
    expect(gridHeight(globe, latLonToMe(22.5, 22.5 + 45 * 2))).toBeCloseTo(8 + 2, 9)
    expect(gridHeight(globe, latLonToMe(-67.5, 22.5))).toBeCloseTo(24, 9)
    expect(gridHeight(globe, latLonToMe(-67.5, 0))).toBeCloseTo((24 + 31) / 2, 9) // across the 0° seam
  })

  it('takes the finest grid that covers a point', () => {
    const coarse: ReliefGrid = { ...stereo, values: new Uint16Array(16).fill(1000), half: 50_000, offset: 0, scale: 1 }
    expect(reliefAt([coarse, stereo], pixel(1, 2))).toBeCloseTo(-50 + 2 * 201, 6)
    expect(reliefAt([coarse, stereo], xyToMe(cx + 10_000, cy))).toBe(1000)
    expect(reliefAt([coarse, null], xyToMe(cx + 60_000, cy))).toBeNull()
  })

  it('packs 16-bit heights into the two bytes the shader recombines', () => {
    const v = Uint16Array.from([0, 255, 256, 40_000, 65_535])
    const rg = packRG8(v)
    v.forEach((x, k) => expect(rg[2 * k] * 256 + rg[2 * k + 1]).toBe(x))
  })

  it('picks on the raised terrain: the hit lies on the ground x exag, within a millimetre', () => {
    const hill = (m: Vec3) => 3000 + 500 * Math.sin(m[0] * 3000) // a smooth landscape, metres
    const target = threeToMe(meToThree(latLonToMe(centre.lat, centre.lon)))
    const eye: Vec3 = meToThree([target[0] * 1.03 + 0.01, target[1] * 1.03, target[2] * 1.03])
    const t = meToThree(target)
    const d = [t[0] - eye[0], t[1] - eye[1], t[2] - eye[2]]
    const len = Math.hypot(d[0], d[1], d[2])
    const dir: Vec3 = [d[0] / len, d[1] / len, d[2] / len]
    for (const exag of [1, 3]) {
      const hit = rayRelief(eye, dir, hill, exag)!
      const r = Math.hypot(...hit)
      const m = threeToMe(hit.map((x) => x / r) as Vec3)
      expect(Math.abs((r - 1) * R_M - exag * hill(m))).toBeLessThan(0.002)
    }
    // from an eye lower than the highest ground can be (a close view at x3): still found
    const low: Vec3 = meToThree([target[0] * 1.008 + 0.002, target[1] * 1.008, target[2] * 1.008]) // 14 km up: over the hill, under 33 km
    const dl = [t[0] - low[0], t[1] - low[1], t[2] - low[2]]
    const ll = Math.hypot(dl[0], dl[1], dl[2])
    const near = rayRelief(low, [dl[0] / ll, dl[1] / ll, dl[2] / ll], hill, 3)!
    expect(near).not.toBeNull()
    const rn = Math.hypot(...near)
    expect(Math.abs((rn - 1) * R_M - 3 * hill(threeToMe(near.map((x) => x / rn) as Vec3)))).toBeLessThan(0.002)
    expect(rayRelief(eye, dir)).toEqual(raySphere(eye, dir)) // without heights: the sphere, as before
  })

  it('spaces contours by level', () => {
    expect([contourInterval('pole'), contourInterval('site'), contourInterval('patch')]).toEqual([1000, 100, 20])
  })
})

describe('bearingTo (D76)', () => {
  const R = 1737.4
  const haversine = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
    const r = Math.PI / 180
    const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2
    return 2 * R * Math.asin(Math.sqrt(h))
  }
  it('points north along a meridian and east along a parallel', () => {
    const n = bearingTo({ lat: -88, lon: 40 }, { lat: -87, lon: 40 })
    expect(n.azDeg < 1e-6 || n.azDeg > 360 - 1e-6).toBe(true)
    expect(n.distKm).toBeCloseTo((R * Math.PI) / 180, 6)
    const s = bearingTo({ lat: -87, lon: 40 }, { lat: -88, lon: 40 })
    expect(s.azDeg).toBeCloseTo(180, 6)
    // a short hop along the equator to the east is due east
    expect(bearingTo({ lat: 0, lon: 10 }, { lat: 0, lon: 10.01 }).azDeg).toBeCloseTo(90, 6)
  })
  it('agrees with an independent haversine, and the distance is symmetric', () => {
    const a = { lat: -89.45, lon: -137.31 } // two arbitrary south-polar points
    const b = { lat: -85.995, lon: -0.236 }
    const ab = bearingTo(a, b)
    expect(ab.distKm).toBeCloseTo(haversine(a, b), 6)
    expect(bearingTo(b, a).distKm).toBeCloseTo(ab.distKm, 9)
    expect(ab.azDeg).toBeGreaterThanOrEqual(0)
    expect(ab.azDeg).toBeLessThan(360)
  })
})
