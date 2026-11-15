// F21 browser side: validate Gemini's constraint JSON against the schema before showing it for confirmation.
import type { ConstraintDef } from './data'
import type { Constraints } from './engine/engine'

export interface Suggestion {
  values: Constraints // schema-valid fields only
  rejected: string[] // unknown fields and out-of-range or wrong-type values, named for the user
}

/** Strict: unknown fields and out-of-range values are rejected, never coerced. */
export function parseSuggestion(defs: ConstraintDef[], raw: unknown): Suggestion {
  const values: Constraints = {}
  const rejected: string[] = []
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { values, rejected: ['reply is not an object'] }
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const d = defs.find((x) => x.id === k)
    if (!d) rejected.push(`${k} (unknown field)`)
    else if (d.type === 'boolean' ? typeof v !== 'boolean' : typeof v !== 'number' || !Number.isFinite(v) || v < d.min! || v > d.max!)
      rejected.push(`${k} = ${JSON.stringify(v)} (${d.type === 'boolean' ? 'not true/false' : `outside ${d.min}–${d.max} ${d.unit}`})`)
    else values[k] = v as number | boolean
  }
  return { values, rejected }
}

const cache = new Map<string, unknown>() // the same sentence is never sent twice in a session (tokens are limited)

export async function askGemini(sentence: string): Promise<unknown> {
  if (cache.has(sentence)) return cache.get(sentence)
  const r = await fetch('/api/constraints', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sentence }) })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
  cache.set(sentence, body.values)
  return body.values
}
