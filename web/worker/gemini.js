// F21: a typed requirement becomes constraint JSON. Gemini gets constraints.schema.json as the response
// schema; the browser validates the reply against the same schema before anything is applied. Gemini
// never sees engine results. The key is a Worker secret (GEMINI_API_KEY).
import { MODEL, callGemini, gate, readJson } from './gemini-call.js'

const MAX_CHARS = 300
export const UNITS = 'Units: days for durations, hours for darkness, percent for Earth visibility, degrees for elevation and slope, km for the search radius.'

/** The constraint fields as a JSON-schema object, from our own published schema (one source for panel, Gemini and validator). */
export async function constraintProperties(request, env) {
  const schema = await (await env.ASSETS.fetch(new URL('/data/constraints.schema.json', request.url))).json()
  return Object.fromEntries(schema.constraints.map((c) => [
    c.id, c.type === 'boolean' ? { type: 'boolean' } : { type: 'number', minimum: c.min, maximum: c.max },
  ]))
}

export async function readSentence(request) {
  const sentence = String((await readJson(request))?.sentence ?? '').trim()
  return sentence && sentence.length <= MAX_CHARS ? sentence : null
}

export async function constraintsFromSentence(request, env) {
  const stop = gate(request, env, 'Sentence entry')
  if (stop) return stop
  const sentence = await readSentence(request)
  if (!sentence) return Response.json({ error: `Write 1 to ${MAX_CHARS} characters` }, { status: 400 })
  const properties = await constraintProperties(request, env)
  const r = await callGemini(env,
    `Turn this lunar lander requirement into constraint values. Include only fields it states. ${UNITS}\nRequirement: ${sentence}`,
    { schema: { type: 'object', properties, additionalProperties: false }, maxTokens: 120 })
  if (r.error) return Response.json({ error: r.error }, { status: r.status })
  let values
  try {
    values = JSON.parse(r.text)
  } catch {
    return Response.json({ error: 'Gemini did not return JSON' }, { status: 502 })
  }
  return Response.json({ values, model: MODEL, generated: true })
}
