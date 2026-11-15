// F27 "Why not?": the engine says what a failing plan would need (relaxations, earliest passing date); a template
// says it in words at zero tokens. Gemini may rephrase it on request, kept only if every number is a fact.
import type { Relaxation } from './engine/finder'
import { allowedFrom, looksLikeProse } from './describe'

const NAMES: Record<string, { what: string; unit: string; allow: (v: number) => string }> = {
  min_continuous_sun_days: { what: 'continuous sunlight', unit: ' days', allow: (v) => `${v} days of continuous sunlight` },
  max_continuous_dark_hours: { what: 'longest darkness', unit: ' h', allow: (v) => `${v} h of darkness` },
  min_earth_visible_pct: { what: 'Earth visibility', unit: '%', allow: (v) => `${v}% Earth visibility` },
  max_slope_deg: { what: 'slope', unit: '°', allow: (v) => `a ${v}° slope` },
}

export interface WhyNotFacts {
  fails: { constraint: string; actual: number | null; limit: number | null; unit: string }[]
  relax_to: string[] // the change per failing constraint, in words
  later_hours: number | null // land this many hours later and everything passes (null: not within the slip range)
  later_days: number | null
}

export function whyNotFacts(relax: Relaxation[], laterHours: number | null): WhyNotFacts {
  return {
    fails: relax.map((r) => r.id === 'landing_sun_and_earth_visible'
      ? { constraint: 'Sun and Earth visible at touchdown', actual: null, limit: null, unit: '' }
      : { constraint: NAMES[r.id].what, actual: r.actual as number, limit: r.limit as number, unit: NAMES[r.id].unit.trim() }),
    relax_to: relax.map((r) => (r.id === 'landing_sun_and_earth_visible' ? 'drop the touchdown Sun-and-Earth check' : `allow ${NAMES[r.id].allow(r.needed as number)}`)),
    later_hours: laterHours,
    later_days: laterHours === null ? null : Math.round((laterHours / 24) * 10) / 10,
  }
}

const later = (f: WhyNotFacts) => (f.later_hours === null ? '' : f.later_hours < 48 ? `${f.later_hours} h later` : `${f.later_days} days later`)

/** One line for a failing result or plan, from the facts alone. */
export function whyNotText(f: WhyNotFacts): string {
  if (!f.fails.length) return ''
  const fails = f.fails.map((x) => (x.actual === null ? x.constraint : `${x.constraint} (${x.actual}${x.unit === '%' || x.unit === '°' ? '' : ' '}${x.unit}, limit ${x.limit}${x.unit === '%' || x.unit === '°' ? '' : ' '}${x.unit})`))
  // "allow 112 h of darkness and 31% Earth visibility": say "allow" once
  const fix = f.relax_to.map((r, i) => (i > 0 && r.startsWith('allow ') && f.relax_to[i - 1].startsWith('allow ') ? r.slice(6) : r)).join(' and ')
  const when = later(f)
  return `Fails on ${fails.join(', ')}. Passes if you ${fix}${when ? `, or if you land ${when} at the same point` : ''}.`
}

export function whyNotNumbersOk(text: string, f: WhyNotFacts): boolean {
  const nums: (number | null)[] = [f.later_hours, f.later_days]
  for (const x of f.fails) nums.push(x.actual, x.limit)
  for (const r of f.relax_to) for (const m of r.match(/\d+(?:\.\d+)?/g) ?? []) nums.push(Number(m))
  const allowed = allowedFrom(nums)
  return (text.match(/\d+(?:\.\d+)?/g) ?? []).every((n) => allowed.has(n.replace(/\.0$/, '')))
}

const cache = new Map<string, string>() // one Gemini call per distinct set of facts per session (tokens are limited)

export async function askWhyNot(facts: WhyNotFacts): Promise<string> {
  const key = JSON.stringify(facts)
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const r = await fetch('/api/whynot', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts }) })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
  const text = String(body.text ?? '')
  cache.set(key, text)
  return text
}

export const looksLikeWhyNot = (text: string) => looksLikeProse(text, /\b(pass|fail|allow|later|limit|need)/i)
