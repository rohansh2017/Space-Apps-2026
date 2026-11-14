import { expect, it } from 'vitest'
import type { Candidate } from './finder'
import { runFinder } from './finder'

// Spec performance target: 5,000 candidates x 60-day slip range in under 3 s. `make perf` prints the time.
it('finder: 5,000 candidates x 60-day slip range in under 3 s', () => {
  const hours = 24 * 120
  const table = new Float32Array(hours * 7)
  for (let h = 0; h < hours; h++) {
    const a = (2 * Math.PI * h) / 708
    table.set([Math.cos(a), Math.sin(a), -0.026, 0.996, 0, -0.0872, 384400], h * 7)
  }
  const candidates: Candidate[] = Array.from({ length: 5000 }, (_, i) => {
    const mask = new Uint16Array(360)
    for (let az = 0; az < 360; az++) mask[az] = 1000 + 150 * (1 + Math.sin((az + i) / 20)) // 0..3 deg horizon
    return { id: `p${i}`, label: 'perf', lat: -89 + (i % 70) * 0.01, lon: i % 360, elevM: 0, slopeDeg: i % 15, mask }
  })
  const r = runFinder(table, hours, candidates, 24 * 40, {
    mission_duration_days: 7, min_continuous_sun_days: 6, max_continuous_dark_hours: 80, min_earth_visible_pct: 40,
    min_earth_elevation_deg: 1, landing_sun_and_earth_visible: true, max_slope_deg: 10, slip_range_days: 30, search_radius_km: 5,
  })
  console.log(`PERF finder: ${candidates.length} candidates, ${r.evaluated} (candidate, start) pairs, ${r.ms.toFixed(0)} ms`)
  expect(r.evaluated).toBeGreaterThanOrEqual(5000 * 61)
  expect(r.ms).toBeLessThan(3000)
})
