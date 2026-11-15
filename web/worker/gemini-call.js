// Shared Gemini plumbing for every /api/* route (D63): per-IP rate limit, one REST call to the Interactions
// API with low thinking and a runaway cap, and the reply text.
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

// Thinking tokens count against max_output_tokens (measured 2026-11-15: a 120 cap went 117 to thought and the
// reply came back "incomplete" with no text), so the cap is a runaway guard, not a reply length. "low" is the
// lowest thinking level gemini-4-hydrogen accepts ("minimal" answers 400); replies stay short through the prompts.
const MAX_TOKENS = 1024
const THINKING = 'low'

/** One Gemini call. `schema` asks for JSON. Returns {text} or {error, status}. */
export async function callGemini(env, input, { schema = null } = {}) {
  const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json', 'api-revision': '2026-05-20' },
    body: JSON.stringify({
      model: MODEL,
      input,
      generation_config: { max_output_tokens: MAX_TOKENS, thinking_level: THINKING },
      ...(schema ? { response_format: { type: 'text', mime_type: 'application/json', schema } } : {}),
    }),
  })
  if (!upstream.ok) return { error: `Gemini answered ${upstream.status}${upstream.status === 503 ? ' (busy; try again shortly)' : ''}`, status: 502 }
  const reply = await upstream.json()
  const text = reply.output_text
    ?? reply.steps?.flatMap((s) => (s.type === 'model_output' ? s.content ?? [] : [])).find((c) => c.type === 'text')?.text
  if (reply.status === 'incomplete') return { error: 'Gemini stopped before finishing its answer', status: 502 }
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
