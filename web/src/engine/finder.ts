// Constraint finder: candidates x start times, ranked by pass count then weighted margin. Pure; runs in a worker.
import type { Constraints, Evaluation, Metrics, SiteFrame } from './engine'
import { buildSeries, evaluate, siteFrame, windowMetrics } from './engine'

export interface Candidate {
  id: string
  label: string // curated site name the point belongs to
  lat: number
  lon: number
  elevM: number
  slopeDeg: number
  mask: Uint16Array // 360 raw bins
}

export interface Scored {
  candidate: number // index into the candidates array
  start: number // ephemeris row of the landing hour
  metrics: Metrics
  evaluation: Evaluation
}

export interface FinderResult {
  baseline: Scored
  results: Scored[] // best start per candidate, best first; the baseline pair itself is excluded
  evaluated: number // (candidate, start) pairs scored
  ms: number
  planPassStart: number | null // F27: earliest hour, from the planned one, at which the plan's own point meets everything (null: none in the slip range)
}

const better = (a: Evaluation, b: Evaluation) => a.fails < b.fails || (a.fails === b.fails && a.score > b.score)
const REFINE_TOP = 10

/**
 * Score every candidate at daily start steps from `start` to the end of the slip range (a slipped
 * launch cannot land earlier), keep the best start per candidate, then refine the top results
 * hourly. candidates[0] is the original plan.
 */
export function runFinder(
  table: ArrayLike<number>, tableHours: number, candidates: Candidate[], start: number, c: Constraints,
  weights: Record<string, number> = {}, keep = 10,
): FinderResult {
  const t0 = performance.now()
  const dur = Math.round(Number(c.mission_duration_days) * 24)
  const slip = Math.round(Number(c.slip_range_days) * 24)
  const first = start // forward only: see DECISIONS D19
  const lastStart = Math.min(start + slip, tableHours - dur)
  if (start < 0 || lastStart < first) throw new RangeError('mission window runs past the ephemeris')
  const n = lastStart + dur - first
  const minEarthEl = Number(c.min_earth_elevation_deg)
  let evaluated = 0

  const score = (ci: number, p: ReturnType<typeof buildSeries>, s: number): Scored => {
    evaluated++
    const metrics = windowMetrics(p, s - first, dur)
    return { candidate: ci, start: s, metrics, evaluation: evaluate(metrics, candidates[ci].slopeDeg, c, weights) }
  }
  const frames: SiteFrame[] = candidates.map((k) => siteFrame(k.lat, k.lon, k.elevM))
  const series = (ci: number) => buildSeries(table, first, n, frames[ci], candidates[ci].mask, minEarthEl)

  let baseline: Scored | null = null
  let planPassStart: number | null = null
  const best: Scored[] = []
  candidates.forEach((_, ci) => {
    const p = series(ci)
    if (ci === 0) {
      baseline = score(0, p, start)
      // F27: walk the plan's own point hourly (forward only); windowMetrics walks run segments, so this stays cheap
      for (let s = start; s <= lastStart && planPassStart === null; s++)
        if (evaluate(windowMetrics(p, s - first, dur), candidates[0].slopeDeg, c, weights).fails === 0) planPassStart = s
    }
    let top: Scored | null = null
    for (let s = first; s <= lastStart; s += 24) {
      if (ci === 0 && s === start) continue // the plan itself is not an alternative
      const r = score(ci, p, s)
      if (!top || better(r.evaluation, top.evaluation)) top = r
    }
    if (top) best.push(top)
  })
  best.sort((a, b) => (better(a.evaluation, b.evaluation) ? -1 : better(b.evaluation, a.evaluation) ? 1 : 0))

  const results = best.slice(0, keep)
  for (const r of results.slice(0, REFINE_TOP)) {
    const p = series(r.candidate)
    for (let s = Math.max(first, r.start - 23); s <= Math.min(lastStart, r.start + 23); s++) {
      if (r.candidate === 0 && s === start) continue
      const h = score(r.candidate, p, s)
      if (better(h.evaluation, r.evaluation)) Object.assign(r, h)
    }
  }
  results.sort((a, b) => (better(a.evaluation, b.evaluation) ? -1 : better(b.evaluation, a.evaluation) ? 1 : 0))
  return { baseline: baseline!, results, evaluated, ms: performance.now() - t0, planPassStart }
}

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
const signed = (v: number, digits = 0) => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(digits)}`

/** One-line plain-language difference from the original plan, e.g. "1.4 km NE, 2 days later: +9% sun, −31 h dark, −5% comms". */
export interface DiffParts {
  where: string // "5.0 km S" or "Same site"
  when: string // "16 days later", "12 h earlier" or "same date"
  shift: string // the same, signed and short: "+16 days", "−12 h", "same date"
  metrics: string // "+97% sun, −158 h dark, +100% comms"
}

/** How a result differs from the original plan, in parts, so titles and sentences cannot disagree. */
export function diffParts(base: Candidate, baseScored: Scored, cand: Candidate, scored: Scored): DiffParts {
  const f = siteFrame(base.lat, base.lon, base.elevM)
  const p = siteFrame(cand.lat, cand.lon, cand.elevM).pos
  const d = [p[0] - f.pos[0], p[1] - f.pos[1], p[2] - f.pos[2]]
  const east = d[0] * f.east[0] + d[1] * f.east[1] + d[2] * f.east[2]
  const north = d[0] * f.north[0] + d[1] * f.north[1] + d[2] * f.north[2]
  const km = Math.hypot(east, north)
  const bearing = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360
  const where = km < 0.001 ? 'Same site' : `${km < 10 ? km.toFixed(1) : km.toFixed(0)} km ${COMPASS[Math.round(bearing / 45) % 8]}`

  const dh = scored.start - baseScored.start
  const days = Math.abs(dh) / 24
  const amount = Math.abs(dh) < 24 ? `${Math.abs(dh)} h` : `${Number.isInteger(days) ? days : days.toFixed(1)} day${days === 1 ? '' : 's'}`
  const when = dh === 0 ? 'same date' : `${amount} ${dh > 0 ? 'later' : 'earlier'}`
  const shift = dh === 0 ? 'same date' : `${dh > 0 ? '+' : '−'}${amount}`

  const [m, b] = [scored.metrics, baseScored.metrics]
  const metrics = `${signed(m.sunlitPct - b.sunlitPct)}% sun, ${signed(m.longestDarkH - b.longestDarkH)} h dark, ${signed(m.earthPct - b.earthPct)}% comms`
  return { where, when, shift, metrics }
}

/** One-line plain-language difference from the original plan, e.g. "1.4 km NE, 2 days later: +9% sun, −31 h dark, −5% comms". */
export function diffText(base: Candidate, baseScored: Scored, cand: Candidate, scored: Scored): string {
  const { where, when, metrics } = diffParts(base, baseScored, cand, scored)
  return `${where}, ${when}: ${metrics}`
}

/** F27: what a failing constraint would have to be set to for this point and date to pass. */
export interface Relaxation {
  id: string
  actual: number | boolean // what the point achieves (hours, %, degrees; days for sunlight)
  limit: number | boolean // what the constraint asks for now
  needed: number | boolean // the loosest-change value that passes
}

/** Read straight from the metrics: no search, no rounding that could make a "needed" value still fail. */
export function relaxations(m: Metrics, slopeDeg: number, c: Constraints, e: Evaluation): Relaxation[] {
  const out: Relaxation[] = []
  for (const [id, pass] of Object.entries(e.passes)) {
    if (pass) continue
    if (id === 'min_continuous_sun_days') {
      const days = Math.floor((m.longestLitH / 24) * 10) / 10 // round down so needed × 24 ≤ longest lit
      out.push({ id, actual: days, limit: Number(c[id]), needed: days })
    } else if (id === 'max_continuous_dark_hours') out.push({ id, actual: m.longestDarkH, limit: Number(c[id]), needed: m.longestDarkH })
    else if (id === 'min_earth_visible_pct') {
      const pct = Math.floor(m.earthPct)
      out.push({ id, actual: pct, limit: Number(c[id]), needed: pct })
    } else if (id === 'max_slope_deg') {
      const deg = Math.ceil(slopeDeg)
      out.push({ id, actual: deg, limit: Number(c[id]), needed: deg })
    } else if (id === 'landing_sun_and_earth_visible') out.push({ id, actual: false, limit: true, needed: false })
  }
  return out
}
