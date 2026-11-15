// F30: view filters over the finder's ranked pool. Pure: they hide and reorder results, never rescore them.
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
  sort: 'margin' | 'soonest'
}

export const NO_FILTER: ResultFilter = { minDays: null, maxDays: null, maxKm: null, sites: [], allPass: false, mustPass: [], sort: 'margin' }

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

/** The rows that pass the filter, in the chosen order; `shown` is the first `SHOW` of them. */
export function applyFilter(rows: Row[], candidates: Candidate[], f: ResultFilter): { shown: Row[]; matches: number } {
  const sites = new Set(f.sites)
  const kept = rows.filter(({ r, km, days }) =>
    (f.minDays === null || days >= f.minDays)
    && (f.maxDays === null || days <= f.maxDays)
    && (f.maxKm === null || km <= f.maxKm)
    && (!sites.size || sites.has(candidates[r.candidate].label))
    && (!f.allPass || r.evaluation.fails === 0)
    && f.mustPass.every((id) => r.evaluation.passes[id] === true))
  if (f.sort === 'soonest') kept.sort((a, b) => a.r.start - b.r.start || a.rank - b.rank)
  return { shown: kept.slice(0, SHOW), matches: kept.length }
}

/** A constraint's name as the filter menu and pills say it. */
export const criterion = (id: string) => (id === 'landing_sun_and_earth_visible' ? 'Sun + Earth at landing' : LABELS[id]?.name ?? id)

export interface Pill { key: string; text: string; remove: ResultFilter }

/** One pill per active filter, each with the filter it leaves when removed. */
export function pillsOf(f: ResultFilter): Pill[] {
  const out: Pill[] = []
  if (f.minDays !== null || f.maxDays !== null) {
    const text = f.minDays !== null && f.maxDays !== null ? `${f.minDays}–${f.maxDays} days out`
      : f.maxDays !== null ? `Up to ${f.maxDays} days out` : `${f.minDays}+ days out` // the bundled face has no ≤ / ≥
    out.push({ key: 'days', text, remove: { ...f, minDays: null, maxDays: null } })
  }
  if (f.maxKm !== null) out.push({ key: 'km', text: `Within ${f.maxKm} km`, remove: { ...f, maxKm: null } })
  for (const s of f.sites) out.push({ key: `site:${s}`, text: s, remove: { ...f, sites: f.sites.filter((x) => x !== s) } })
  if (f.allPass) out.push({ key: 'all', text: 'Meets every constraint', remove: { ...f, allPass: false } })
  for (const id of f.mustPass) out.push({ key: `pass:${id}`, text: `${criterion(id)} met`, remove: { ...f, mustPass: f.mustPass.filter((x) => x !== id) } })
  return out
}
