// Shared Gemini plumbing for every /api/* route (D63): per-IP rate limit, one REST call to the Interactions
// API, the reply text, and a hard output cap with minimal thinking so each call stays small (tokens are limited).
export const MODEL = 'gemini-4-hydrogen'
const PER_MINUTE = 10 // per client IP, per isolate: a cap, not an accounting system
const recent = new Map()

/** A Response to return early (method, key or rate limit), or null when the call may go ahead. */
export function gate(request, env, what) {
  if (request.method !== 'POST') return Response.json({ error: 'POST a JSON body' }, { status: 405 })
  if (!env.GEMINI_API_KEY) return Response.json({ error: `${what} is not configured on this deployment` }, { status: 503 })
  const ip = request.headers.get('cf-connecting-ip') ?? 'local'
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000)
  if (hits.length >= PER_MINUTE) return Response.json({ error: 'Too many requests; try again in a minute' }, { status: 429 })
  recent.set(ip, [...hits, now])
  return null
}

/** One Gemini call. `schema` asks for JSON; `maxTokens` caps the reply. Returns {text} or {error, status}. */
export async function callGemini(env, input, { schema = null, maxTokens = 160 } = {}) {
  const send = (thinking) => fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json', 'api-revision': '2026-05-20' },
    body: JSON.stringify({
      model: MODEL,
      input,
      generation_config: { max_output_tokens: maxTokens, ...(thinking ? { thinking_level: 'minimal' } : {}) },
      ...(schema ? { response_format: { type: 'text', mime_type: 'application/json', schema } } : {}),
    }),
  })
  let upstream = await send(true)
  // a model that does not take the minimal thinking level answers 400: retry once without it
  if (upstream.status === 400) upstream = await send(false)
  if (!upstream.ok) return { error: `Gemini answered ${upstream.status}`, status: 502 }
  const reply = await upstream.json()
  const text = reply.output_text
    ?? reply.steps?.flatMap((s) => (s.type === 'model_output' ? s.content ?? [] : [])).find((c) => c.type === 'text')?.text
  if (!text) return { error: 'Gemini returned no text', status: 502 }
  return { text: String(text) }
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}
