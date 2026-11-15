// F26/F29 slip copilot, browser side: validate Gemini's search spec (slip, where, when, constraints) before the user
// confirms it, read the slip locally as a check and a fallback, and summarise the finder's result with a template
// (no second Gemini call: tokens are limited, D63).
import type { ConstraintDef } from './data'
import type { Candidate, FinderResult } from './engine/finder'
import { diffText } from './engine/finder'
import type { Suggestion } from './gemini'
import { parseSuggestion, postApi } from './gemini'

const HOUR_MS = 3_600_000
const MAX_DAYS = 30

export interface Where {
  scope: 'current' | 'sites' | 'all' // the current site's grid; the named sites' grids; every site's grid
  sites: string[] // scope 'sites' only
  withinKm: number | null // stated distance; null = the panel's search radius
}
export interface When {
  order: 'margin' | 'earliest'
  landBy: number | null // latest landing, ms since the epoch
  windowDays: number | null // days to search after the slipped date
}

export interface CopilotPlan extends Suggestion {
  slipDays: number | null // land this many days after the original plan (forward only)
  where: Where | null
  when: When | null
  notes: string[] // what the browser changed or could not do, shown on the card
  local?: boolean // read without Gemini
}

/** What the finder searches, held by the app after a copilot plan is applied (F29). */
export interface SearchSpec {
  scope: 'default' | 'current' | 'sites' | 'all'
  sites: string[]
  withinKm: number | null
  order: 'margin' | 'earliest'
  landBy: number | null
  windowDays: number | null
}
export const DEFAULT_SPEC: SearchSpec = { scope: 'default', sites: [], withinKm: null, order: 'margin', landBy: null, windowDays: null }
export const isDefaultSpec = (s: SearchSpec) =>
  s.scope === 'default' && s.order === 'margin' && s.landBy === null && s.windowDays === null && s.withinKm === null

const num = (v: unknown, min: number, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max
const unknownKeys = (o: Record<string, unknown>, known: string[], where: string) =>
  Object.keys(o).filter((k) => !known.includes(k)).map((k) => `${where}${k} (unknown field)`)

/** Strict, like F21: unknown keys, unknown sites, out-of-range numbers and bad dates are named and dropped, never coerced. */
export function parseCopilot(defs: ConstraintDef[], siteIds: string[], raw: unknown): CopilotPlan {
  const empty: CopilotPlan = { values: {}, rejected: [], slipDays: null, where: null, when: null, notes: [] }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...empty, rejected: ['reply is not an object'] }
  const { constraints, slip, where, when, ...rest } = raw as Record<string, unknown>
  const s = constraints === undefined ? { values: {}, rejected: [] } : parseSuggestion(defs, constraints)
  const rejected = [...s.rejected, ...Object.keys(rest).map((k) => `${k} (unknown field)`)]
  const plan: CopilotPlan = { ...empty, values: s.values, rejected }

  if (slip && typeof slip === 'object') {
    const d = (slip as Record<string, unknown>).days
    if (num(d, 0, MAX_DAYS)) plan.slipDays = Math.round((d as number) * 24) / 24
    else rejected.push(`slip = ${JSON.stringify(d)} days (outside 0–${MAX_DAYS} days)`)
  }

  if (where && typeof where === 'object') {
    const w = where as Record<string, unknown>
    rejected.push(...unknownKeys(w, ['scope', 'sites', 'within_km', 'quote'], 'where.'))
    const scope = w.scope
    let withinKm: number | null = null
    if (w.within_km !== undefined && w.within_km !== null) {
      if (num(w.within_km, 0, 5)) withinKm = w.within_km as number
      else rejected.push(`within ${JSON.stringify(w.within_km)} km (outside 0–5 km)`)
    }
    if (scope === 'current' || scope === 'all') plan.where = { scope, sites: [], withinKm }
    else if (scope === 'sites') {
      const named = Array.isArray(w.sites) ? w.sites : []
      const sites = named.filter((x): x is string => typeof x === 'string' && siteIds.includes(x))
      for (const x of named) if (!sites.includes(x as string)) rejected.push(`site = ${JSON.stringify(x)} (not a site with terrain)`)
      if (sites.length) plan.where = { scope, sites: [...new Set(sites)], withinKm }
    } else rejected.push(`where = ${JSON.stringify(scope)} (not current, sites or all)`)
  }

  if (when && typeof when === 'object') {
    const w = when as Record<string, unknown>
    rejected.push(...unknownKeys(w, ['order', 'land_by_utc', 'window_days', 'quote'], 'when.'))
    const out: When = { order: 'margin', landBy: null, windowDays: null }
    if (w.order === 'earliest') out.order = 'earliest'
    else if (w.order !== undefined && w.order !== 'best_margin') rejected.push(`order = ${JSON.stringify(w.order)} (not earliest or best_margin)`)
    if (w.land_by_utc !== undefined && w.land_by_utc !== null) {
      const t = typeof w.land_by_utc === 'string' ? Date.parse(w.land_by_utc.length <= 10 ? `${w.land_by_utc}T23:59:59Z` : w.land_by_utc) : NaN
      if (Number.isFinite(t)) out.landBy = t
      else rejected.push(`land by ${JSON.stringify(w.land_by_utc)} (not a date)`)
    }
    if (w.window_days !== undefined && w.window_days !== null) {
      if (num(w.window_days, 0, MAX_DAYS)) out.windowDays = w.window_days as number
      else rejected.push(`search window ${JSON.stringify(w.window_days)} days (outside 0–${MAX_DAYS} days)`)
    }
    if (out.order !== 'margin' || out.landBy !== null || out.windowDays !== null) plan.when = out
  }
  return plan
}

export const isEmptyPlan = (p: CopilotPlan) => !Object.keys(p.values).length && p.slipDays === null && p.where === null && p.when === null

const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fourteen: 14, fifteen: 15, twenty: 20, thirty: 30 }
const SLIP_RE = /\b(?:slip(?:ped|s)?|slipping|delay(?:ed|s)?|postpone(?:d|s)?|pushed back|moved back)\b(?:\s+(?:by|of|for|about|around|roughly|another))*\s+(\d+(?:\.\d+)?|[a-z]+)\s*(hours?|hrs?|h|days?|d|weeks?|wks?|w)\b/i

/** F29: the slip in days from plain words ("slipped by 11 days", "delayed two weeks", "slips 36 hours"), or null. No Gemini. */
export function readSlipLocally(text: string): number | null {
  const m = SLIP_RE.exec(text)
  if (!m) return null
  const n = /^\d/.test(m[1]) ? Number(m[1]) : WORDS[m[1].toLowerCase()]
  if (n === undefined || !Number.isFinite(n)) return null
  const unit = m[2].toLowerCase()
  const days = unit.startsWith('h') ? n / 24 : unit.startsWith('w') ? n * 7 : n
  return days >= 0 && days <= MAX_DAYS ? Math.round(days * 24) / 24 : null
}

/** Fill a slip Gemini missed from the user's own words, and say so on the card. */
export function withLocalSlip(plan: CopilotPlan, sentence: string): CopilotPlan {
  if (plan.slipDays !== null) return plan
  const days = readSlipLocally(sentence)
  if (days === null) return plan
  return { ...plan, slipDays: days, notes: [...plan.notes, `The slip (${dayText(days)}) was read from your words; Gemini left it out.`] }
}

/** When Gemini cannot be reached: the slip alone, from the user's words, or null if there is none. */
export function localPlan(sentence: string, reason: string): CopilotPlan | null {
  const days = readSlipLocally(sentence)
  if (days === null) return null
  return {
    values: {}, rejected: [], slipDays: days, where: null, when: null, local: true,
    notes: [`Read without Gemini (${reason}). Only the slip was read; where to search and when to land need Gemini.`],
  }
}

/** A "land by" date earlier than the slipped landing cannot be met: name it and drop it. */
export function checkLandBy(plan: CopilotPlan, slippedMs: number, date: (ms: number) => string): CopilotPlan {
  if (!plan.when || plan.when.landBy === null || plan.when.landBy > slippedMs) return plan
  const when = { ...plan.when, landBy: null }
  return {
    ...plan,
    when: when.order === 'margin' && when.windowDays === null ? null : when,
    rejected: [...plan.rejected, `land by ${date(plan.when.landBy)} (before the slipped landing, ${date(slippedMs)})`],
  }
}

export interface SlipAnchor {
  origin: number // the original plan hour the slip is measured from
  applied: number // the hour the last slip moved the plan to
}

/**
 * F29: a slip is measured from the original plan, so applying it again does not stack. If the plan hour was moved
 * by hand since (it is no longer the hour the last slip set), the current hour is the new original.
 */
export function slipFrom(anchor: SlipAnchor | null, planHour: number, days: number, maxHour: number): SlipAnchor {
  const origin = anchor && planHour === anchor.applied ? anchor.origin : planHour
  return { origin, applied: Math.min(maxHour, origin + Math.round(days * 24)) }
}

/** The search spec a confirmed plan sets (a single named site becomes the plan's site, searched as "current"). */
export function specFromPlan(p: CopilotPlan): SearchSpec {
  const w = p.where
  const single = w?.scope === 'sites' && w.sites.length === 1
  return {
    scope: !w ? 'default' : single ? 'current' : w.scope,
    sites: w?.scope === 'sites' && !single ? w.sites : [],
    withinKm: w?.withinKm ?? null,
    order: p.when?.order ?? 'margin',
    landBy: p.when?.landBy ?? null,
    windowDays: p.when?.windowDays ?? null,
  }
}

/** The site the plan should move to: a single named site. */
export const planSite = (p: CopilotPlan) => (p.where?.scope === 'sites' && p.where.sites.length === 1 ? p.where.sites[0] : null)

/** Search window in hours after the slipped landing (null: the panel's slip range). */
export function windowHours(spec: SearchSpec, startMs: number): number | null {
  if (spec.landBy !== null) return Math.max(0, Math.floor((spec.landBy - startMs) / HOUR_MS))
  if (spec.windowDays !== null) return Math.round(spec.windowDays * 24)
  return null
}

export const dayText = (d: number) => {
  if (d < 1) return `${Math.round(d * 24)} h`
  return d === 1 ? '1 day' : `${Number.isInteger(d) ? d : d.toFixed(1)} days`
}

/** Plain words for where the spec searches, e.g. "Shackleton rim's grid within 5 km". */
export function whereText(spec: Pick<SearchSpec, 'scope' | 'sites' | 'withinKm'>, current: string, name: (id: string) => string, radiusKm: number): string {
  const km = spec.withinKm ?? radiusKm
  if (spec.scope === 'current') return `${current}'s grid within ${km} km`
  if (spec.scope === 'all') return 'every site\'s full grid'
  if (spec.scope === 'sites') return `the grids of ${spec.sites.map(name).join(', ')}`
  return `${current}'s grid within ${km} km and the other sites`
}

/** Plain words for when: the order and any window. */
export function whenText(spec: Pick<SearchSpec, 'order' | 'landBy' | 'windowDays'>, date: (ms: number) => string): string {
  const order = spec.order === 'earliest' ? 'earliest date that meets everything first' : 'best margin first'
  const window = spec.landBy !== null ? `, landing by ${date(spec.landBy)}` : spec.windowDays !== null ? `, within ${dayText(spec.windowDays)} of the slipped date` : ''
  return order + window
}

const cache = new Map<string, unknown>() // the same question is never sent twice in a session

export async function askCopilot(sentence: string, context: { siteId: string; planUtc: string }): Promise<unknown> {
  const key = `${sentence}\n${context.siteId}\n${context.planUtc}`
  if (cache.has(key)) return cache.get(key)
  const body = await postApi('/api/copilot', { sentence, site_id: context.siteId, plan_utc: context.planUtc })
  cache.set(key, body.plan)
  return body.plan
}

export interface SummaryContext {
  slip: { days: number; fromMs: number; toMs: number } | null
  searched: string // whereText + whenText, already in words
  order: 'margin' | 'earliest'
}

/** The copilot's answer, built from the finder result alone (every number is the engine's). */
export function copilotSummary(f: FinderResult, candidates: Candidate[], date: (hour: number) => string, ctx?: SummaryContext, dateMs?: (ms: number) => string): string {
  const lead = [
    ctx?.slip && dateMs ? `Slipped ${dayText(ctx.slip.days)} from ${dateMs(ctx.slip.fromMs)} to ${dateMs(ctx.slip.toMs)} UTC.` : '',
    ctx ? `Searched ${ctx.searched}.` : '',
  ].filter(Boolean).join(' ')
  const passing = f.results.filter((r) => r.evaluation.fails === 0)
  const plan = f.baseline.evaluation.fails === 0
    ? 'The slipped plan still meets every constraint.'
    : f.planPassStart !== null
      ? `The slipped plan fails ${f.baseline.evaluation.fails} constraint${f.baseline.evaluation.fails === 1 ? '' : 's'}; the same point passes if you land ${date(f.planPassStart)} UTC.`
      : `The slipped plan fails ${f.baseline.evaluation.fails} constraint${f.baseline.evaluation.fails === 1 ? '' : 's'}, and no later date in the slip range fixes it at the same point.`
  const join = (...parts: string[]) => parts.filter(Boolean).join(' ')
  if (!f.results.length) return join(lead, plan, 'No alternatives were found.')
  const best = f.results[0]
  const what = `${candidates[best.candidate].label}, ${diffText(candidates[0], f.baseline, candidates[best.candidate], best)}`
  const head = passing.length
    ? `${passing.length} of ${f.results.length} alternatives meet everything. ${ctx?.order === 'earliest' ? `Earliest: ${what}, landing ${date(best.start)} UTC` : `Best: ${what}`}.`
    : `None of the ${f.results.length} alternatives meets everything; the closest is ${what}.`
  return join(lead, plan, head)
}

/** What the copilot card needs from the app: the plan it reads against, and words for dates and searches. */
export interface CopilotHooks {
  siteIds: string[] // curated sites with terrain, the only ones it may name
  siteId: string // the current plan's site
  planUtc: string // the current plan's landing, ISO
  siteName: (id: string) => string
  preview: (days: number) => { fromMs: number; toMs: number } // where a slip of this many days moves the landing
  describe: (spec: SearchSpec, siteId: string) => { where: string; when: string } // siteId: the site the plan will be at
  date: (ms: number) => string // "3 Dec 2026 14:00"
  apply: (plan: CopilotPlan) => void // apply the confirmed plan and run the finder
}
