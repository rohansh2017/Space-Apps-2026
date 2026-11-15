// F26 slip copilot, browser side: validate Gemini's plan (constraints, slip, site) before the user confirms it,
// then summarise the finder's result with a template (no second Gemini call: tokens are limited, D63).
import type { ConstraintDef } from './data'
import type { Candidate, FinderResult } from './engine/finder'
import { diffText } from './engine/finder'
import type { Suggestion } from './gemini'
import { parseSuggestion, postApi } from './gemini'

export interface CopilotPlan extends Suggestion {
  slipDays: number | null // land this many days after the current plan (forward only)
  site: string | null // curated site id
}

/** Strict, like F21: unknown keys, an unknown site or an out-of-range slip are named and dropped, never coerced. */
export function parseCopilot(defs: ConstraintDef[], siteIds: string[], raw: unknown): CopilotPlan {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { values: {}, rejected: ['reply is not an object'], slipDays: null, site: null }
  const { constraints, slip_days, site, ...rest } = raw as Record<string, unknown>
  const s = constraints === undefined ? { values: {}, rejected: [] } : parseSuggestion(defs, constraints)
  const rejected = [...s.rejected, ...Object.keys(rest).map((k) => `${k} (unknown field)`)]
  let slipDays: number | null = null
  if (slip_days !== undefined && slip_days !== null) {
    if (typeof slip_days === 'number' && Number.isFinite(slip_days) && slip_days >= 0 && slip_days <= 30) slipDays = Math.round(slip_days * 24) / 24
    else rejected.push(`slip_days = ${JSON.stringify(slip_days)} (outside 0–30 days)`)
  }
  let siteId: string | null = null
  if (site !== undefined && site !== null) {
    if (typeof site === 'string' && siteIds.includes(site)) siteId = site
    else rejected.push(`site = ${JSON.stringify(site)} (not a site with terrain)`)
  }
  return { values: s.values, rejected, slipDays, site: siteId }
}

export const isEmptyPlan = (p: CopilotPlan) => !Object.keys(p.values).length && p.slipDays === null && p.site === null

const cache = new Map<string, unknown>() // the same sentence is never sent twice in a session

export async function askCopilot(sentence: string): Promise<unknown> {
  if (cache.has(sentence)) return cache.get(sentence)
  const body = await postApi('/api/copilot', { sentence })
  cache.set(sentence, body.plan)
  return body.plan
}

/** The copilot's answer, built from the finder result alone (every number is the engine's). */
export function copilotSummary(f: FinderResult, candidates: Candidate[], date: (hour: number) => string): string {
  const passing = f.results.filter((r) => r.evaluation.fails === 0)
  const plan = f.baseline.evaluation.fails === 0
    ? 'The slipped plan still meets every constraint.'
    : f.planPassStart !== null
      ? `The slipped plan fails ${f.baseline.evaluation.fails} constraint${f.baseline.evaluation.fails === 1 ? '' : 's'}; the same point passes if you land ${date(f.planPassStart)} UTC.`
      : `The slipped plan fails ${f.baseline.evaluation.fails} constraint${f.baseline.evaluation.fails === 1 ? '' : 's'}, and no later date in the slip range fixes it at the same point.`
  if (!f.results.length) return `${plan} No alternatives were found.`
  const best = f.results[0]
  const head = passing.length
    ? `${passing.length} of ${f.results.length} alternatives meet everything. Best: ${candidates[best.candidate].label}, ${diffText(candidates[0], f.baseline, candidates[best.candidate], best)}.`
    : `None of the ${f.results.length} alternatives meets everything; the closest is ${candidates[best.candidate].label}, ${diffText(candidates[0], f.baseline, candidates[best.candidate], best)}.`
  return `${plan} ${head}`
}
