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

/** POST to a Gemini route. A 404, or a proxy error with no JSON body, means no Worker is serving /api here (plain `make dev`). */
export async function postApi(path: string, payload: unknown): Promise<Record<string, unknown>> {
  let r: Response
  try {
    r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  } catch {
    throw new Error('Could not reach the Gemini route')
  }
  const body = await r.json().catch(() => null)
  if (r.ok && body) return body
  if (body?.error) throw new Error(String(body.error))
  if (r.status === 404 || r.status >= 500)
    throw new Error('Gemini runs in the Cloudflare Worker, which is not running here: run `make dev-api` beside `make dev`, or use the deployed site')
  throw new Error(`HTTP ${r.status}`)
}

const cache = new Map<string, unknown>() // the same sentence is never sent twice in a session (tokens are limited)

export async function askGemini(sentence: string): Promise<unknown> {
  if (cache.has(sentence)) return cache.get(sentence)
  const body = await postApi('/api/constraints', { sentence })
  cache.set(sentence, body.values)
  return body.values
}
