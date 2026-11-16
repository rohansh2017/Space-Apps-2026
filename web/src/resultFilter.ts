// F30: view filters over the finder's ranked pool. Pure: they hide and reorder results, never rescore them.
import type { Constraints } from './engine/engine'
import type { Candidate, Scored } from './engine/finder'
import { diffParts } from './engine/finder'
import { LABELS } from './presets'

export interface ResultFilter {
  minDays: number | null // days out from the planned hour (landing hour − planned hour)
  maxDays: number | null
  maxKm: number | null // distance from the plan's point
  sites: string[] // candidate labels (curated site names); empty = every site
  allPass: boolean // meets every constraint
  mustPass: string[] // constraint ids that must pass
  thresholds: Record<string, number> // F32: a ticked criterion's slider value (absent: the search's constraint value)
  sort: 'margin' | 'soonest'
}

export const NO_FILTER: ResultFilter = { minDays: null, maxDays: null, maxKm: null, sites: [], allPass: false, mustPass: [], thresholds: {}, sort: 'margin' }

export const SHOW = 10 // rows shown at once, as before filters

/** How many filters narrow the list (sort is not a filter). */
export function activeCount(f: ResultFilter): number {
  return (f.minDays !== null || f.maxDays !== null ? 1 : 0) + (f.maxKm !== null ? 1 : 0) + f.sites.length + (f.allPass ? 1 : 0) + f.mustPass.length
}

export interface Row {
  r: Scored
  rank: number // 1-based position in the unfiltered pool, so "#17" means the same with or without filters
  km: number
  days: number
}

/** Every pool entry with its rank, distance and days out. Computed once per search. */
export function rowsOf(pool: Scored[], candidates: Candidate[], baseline: Scored): Row[] {
  return pool.map((r, i) => {
    const d = diffParts(candidates[0], baseline, candidates[r.candidate], r)
    return { r, rank: i + 1, km: d.km, days: d.hours / 24 }
  })
}

/** F32: the criteria that get a threshold slider, how each compares, its unit, step, and the value in the constraint's unit. */
export const SLIDERS: Record<string, { dir: 'min' | 'max'; unit: string; step: number; value: (r: Scored, c: Candidate) => number }> = {
  min_continuous_sun_days: { dir: 'min', unit: 'days', step: 0.5, value: (r) => r.metrics.longestLitH / 24 },
  max_continuous_dark_hours: { dir: 'max', unit: 'h', step: 1, value: (r) => r.metrics.longestDarkH },
  min_earth_visible_pct: { dir: 'min', unit: '%', step: 1, value: (r) => r.metrics.earthPct },
  max_slope_deg: { dir: 'max', unit: '°', step: 0.5, value: (_, c) => c.slopeDeg },
}

/** A ticked criterion's threshold: the slider's value, else the constraint the search ran with. */
export const thresholdOf = (f: ResultFilter, id: string, c: Constraints) => f.thresholds[id] ?? Number(c[id])

/**
 * F32: whether a row meets a criterion at a threshold, compared as evaluate() does (sun in hours, so a threshold equal to
 * the constraint gives exactly the engine's pass mark). The landing criterion has no slider: it is the engine's landing check.
 */
export function meets(id: string, r: Scored, cand: Candidate, threshold: number): boolean {
  if (id === 'min_continuous_sun_days') return r.metrics.longestLitH >= threshold * 24
  const s = SLIDERS[id]
  if (!s) return id === 'landing_sun_and_earth_visible' ? r.metrics.landingOk : r.evaluation.passes[id] !== false
  return s.dir === 'min' ? s.value(r, cand) >= threshold : s.value(r, cand) <= threshold
}

/** F32: the ticked thresholds that differ from the constraints the search ran with: what Recompute writes back. */
export function overridesOf(f: ResultFilter, c: Constraints): Record<string, number> {
  if (f.allPass) return {}
  return Object.fromEntries(f.mustPass.filter((id) => id in SLIDERS && id in f.thresholds && f.thresholds[id] !== Number(c[id])).map((id) => [id, f.thresholds[id]]))
}

/** The rows that pass the filter, in the chosen order; `shown` is the first `SHOW` of them. */
export function applyFilter(rows: Row[], candidates: Candidate[], f: ResultFilter, c: Constraints): { shown: Row[]; matches: number } {
  const sites = new Set(f.sites)
  const kept = rows.filter(({ r, km, days }) =>
    (f.minDays === null || days >= f.minDays)
    && (f.maxDays === null || days <= f.maxDays)
    && (f.maxKm === null || km <= f.maxKm)
    && (!sites.size || sites.has(candidates[r.candidate].label))
    && (!f.allPass || r.evaluation.fails === 0)
    && f.mustPass.every((id) => meets(id, r, candidates[r.candidate], thresholdOf(f, id, c)))) // F32: from the metrics, so it holds even for a criterion the search ignored (F31)
  if (f.sort === 'soonest') kept.sort((a, b) => a.r.start - b.r.start || a.rank - b.rank)
  return { shown: kept.slice(0, SHOW), matches: kept.length }
}

/** A constraint's name as the filter menu and pills say it. */
export const criterion = (id: string) => (id === 'landing_sun_and_earth_visible' ? 'Sun + Earth at landing' : LABELS[id]?.name ?? id)

export interface Pill { key: string; text: string; remove: ResultFilter }

const without = (o: Record<string, number>, k: string) => Object.fromEntries(Object.entries(o).filter(([x]) => x !== k))
const fmt = (v: number) => String(Number(v.toFixed(1)))

/** F32: a ticked criterion as a pill says it: "Sun 8+ days", "Dark up to 60 h" (the bundled face has no ≤ / ≥). */
export function thresholdText(id: string, v: number): string {
  const s = SLIDERS[id]
  if (!s) return `${criterion(id)} met`
  const name = LABELS[id]?.chip ?? id
  const unit = s.unit === '°' ? '°' : ` ${s.unit}`
  return s.dir === 'min' ? `${name} ${fmt(v)}+${unit}` : `${name} up to ${fmt(v)}${unit}`
}

/** One pill per active filter, each with the filter it leaves when removed. */
export function pillsOf(f: ResultFilter, c: Constraints): Pill[] {
  const out: Pill[] = []
  if (f.minDays !== null || f.maxDays !== null) {
    const text = f.minDays !== null && f.maxDays !== null ? `${f.minDays}–${f.maxDays} days out`
      : f.maxDays !== null ? `Up to ${f.maxDays} days out` : `${f.minDays}+ days out` // the bundled face has no ≤ / ≥
    out.push({ key: 'days', text, remove: { ...f, minDays: null, maxDays: null } })
  }
  if (f.maxKm !== null) out.push({ key: 'km', text: `Within ${f.maxKm} km`, remove: { ...f, maxKm: null } })
  for (const s of f.sites) out.push({ key: `site:${s}`, text: s, remove: { ...f, sites: f.sites.filter((x) => x !== s) } })
  if (f.allPass) out.push({ key: 'all', text: 'Meets every constraint', remove: { ...f, allPass: false } })
  for (const id of f.mustPass)
    out.push({ key: `pass:${id}`, text: thresholdText(id, thresholdOf(f, id, c)), remove: { ...f, mustPass: f.mustPass.filter((x) => x !== id), thresholds: without(f.thresholds, id) } })
  return out
}

/** "A", "A and B", "A, B and C". */
export const listOf = (xs: string[]) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`)

/** F31: whether two constraint lists name the same constraints. */
export const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x))
