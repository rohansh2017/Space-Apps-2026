// F21: a typed requirement becomes constraint JSON. Gemini gets constraints.schema.json as the response
// schema; the browser validates the reply against the same schema before anything is applied. Gemini
// never sees engine results. The key is a Worker secret (GEMINI_API_KEY).
const MODEL = 'gemini-4-hydrogen'
const MAX_CHARS = 300
const PER_MINUTE = 10 // per client IP, per isolate: a cap, not an accounting system
const recent = new Map()

const PROMPT = 'You turn a lunar lander mission requirement into constraint values. Include only the fields the sentence '
  + 'states and leave every other field out. Units: days for durations, hours for darkness, percent for Earth '
  + 'visibility, degrees for elevation and slope, km for the search radius.\nRequirement: '

export async function constraintsFromSentence(request, env) {
  if (request.method !== 'POST') return Response.json({ error: 'POST a JSON body {sentence}' }, { status: 405 })
  if (!env.GEMINI_API_KEY) return Response.json({ error: 'Sentence entry is not configured on this deployment' }, { status: 503 })
  const ip = request.headers.get('cf-connecting-ip') ?? 'local'
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000)
  if (hits.length >= PER_MINUTE) return Response.json({ error: 'Too many requests; try again in a minute' }, { status: 429 })
  recent.set(ip, [...hits, now])

  let sentence
  try {
    sentence = String((await request.json()).sentence ?? '').trim()
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  if (!sentence || sentence.length > MAX_CHARS) return Response.json({ error: `Write 1 to ${MAX_CHARS} characters` }, { status: 400 })

  // one schema for the panel, Gemini and the validator: read our own published copy
  const schema = await (await env.ASSETS.fetch(new URL('/data/constraints.schema.json', request.url))).json()
  const properties = Object.fromEntries(schema.constraints.map((c) => [
    c.id, c.type === 'boolean' ? { type: 'boolean' } : { type: 'number', minimum: c.min, maximum: c.max },
  ]))
  const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json', 'api-revision': '2026-05-20' },
    body: JSON.stringify({
      model: MODEL,
      input: PROMPT + sentence,
      response_format: { type: 'text', mime_type: 'application/json', schema: { type: 'object', properties, additionalProperties: false } },
    }),
  })
  if (!upstream.ok) return Response.json({ error: `Gemini answered ${upstream.status}` }, { status: 502 })
  const reply = await upstream.json()
  const text = reply.steps?.flatMap((s) => (s.type === 'model_output' ? s.content ?? [] : [])).find((c) => c.type === 'text')?.text
  let values
  try {
    values = JSON.parse(text)
  } catch {
    return Response.json({ error: 'Gemini did not return JSON' }, { status: 502 })
  }
  return Response.json({ values, model: MODEL, generated: true })
}
