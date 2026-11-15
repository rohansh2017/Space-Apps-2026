// Shared Gemini plumbing for every /api/* route (D63): per-IP rate limit, one REST call to the Interactions
// API (model and thinking from Worker vars, one fallback model on 429/503, a runaway cap), and the reply text.
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

// Model and thinking are Worker vars (wrangler.jsonc), so they change without a code edit. Defaults from the
// D64 benchmark: gemini-3.5-flash-lite answered every route correctly in 1.6-2.0 s with zero thought tokens, where
// gemini-4-hydrogen took 20-96 s. Thinking tokens count against max_output_tokens, so the cap is a runaway guard
// only (D63: a 120 cap once went entirely to thought). A model that rejects the thinking level is retried at "low".
const MAX_TOKENS = 1024
const DEFAULTS = { model: 'gemini-3.5-flash-lite', thinking: 'minimal', fallback: 'gemini-flash-lite-latest' }

/** One Gemini call. `schema` asks for JSON. Returns {text, model} or {error, status}. */
export async function callGemini(env, input, { schema = null } = {}) {
  const primary = env.GEMINI_MODEL || DEFAULTS.model
  const fallback = env.GEMINI_FALLBACK_MODEL ?? DEFAULTS.fallback
  const thinking = env.GEMINI_THINKING || DEFAULTS.thinking
  const send = (model, level) => fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json', 'api-revision': '2026-05-20' },
    body: JSON.stringify({
      model,
      input,
      generation_config: { max_output_tokens: MAX_TOKENS, thinking_level: level },
      ...(schema ? { response_format: { type: 'text', mime_type: 'application/json', schema } } : {}),
    }),
  })
  let model = primary
  let upstream = await send(model, thinking)
  if (upstream.status === 400 && thinking !== 'low') upstream = await send(model, 'low')
  // busy or over quota: one try on the fallback model, so a demo does not stall on one model's demand spike
  if ((upstream.status === 429 || upstream.status === 503) && fallback && fallback !== primary) {
    model = fallback
    upstream = await send(model, thinking)
    if (upstream.status === 400 && thinking !== 'low') upstream = await send(model, 'low')
  }
  if (!upstream.ok) return { error: `Gemini answered ${upstream.status}${upstream.status === 503 ? ' (busy; try again shortly)' : ''}`, status: 502 }
  const reply = await upstream.json()
  const text = reply.output_text
    ?? reply.steps?.flatMap((s) => (s.type === 'model_output' ? s.content ?? [] : [])).find((c) => c.type === 'text')?.text
  if (reply.status === 'incomplete') return { error: 'Gemini stopped before finishing its answer', status: 502 }
  if (!text) return { error: 'Gemini returned no text', status: 502 }
  return { text: String(text), model }
}

export async function readJson(request) {
  try {
    return await request.json()
  } catch {
    return null
  }
}
