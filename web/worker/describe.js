// F22: a short plain-language description of the horizon panorama, written from engine-derived facts.
// Gemini sees the facts only (never engine series or results); the browser checks every number in the
// reply against the facts and falls back to a template sentence otherwise.
const MODEL = 'gemini-4-hydrogen'
const PER_MINUTE = 10
const recent = new Map()
const KEYS = ['ridge_direction', 'ridge_elevation_deg', 'lowest_direction', 'lowest_elevation_deg', 'window_hours', 'sunlit_pct',
  'sun_max_elevation_deg', 'sun_now', 'hours_to_sun_change', 'earth_now', 'hours_to_earth_change']

export async function describeHorizon(request, env) {
  if (request.method !== 'POST') return Response.json({ error: 'POST a JSON body {facts}' }, { status: 405 })
  if (!env.GEMINI_API_KEY) return Response.json({ error: 'Horizon description is not configured on this deployment' }, { status: 503 })
  const ip = request.headers.get('cf-connecting-ip') ?? 'local'
  const now = Date.now()
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 60_000)
  if (hits.length >= PER_MINUTE) return Response.json({ error: 'Too many requests; try again in a minute' }, { status: 429 })
  recent.set(ip, [...hits, now])

  let facts
  try {
    facts = (await request.json()).facts
  } catch {
    return Response.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  if (!facts || typeof facts !== 'object' || !KEYS.every((k) => k in facts)) return Response.json({ error: 'facts are incomplete' }, { status: 400 })
  const clean = Object.fromEntries(KEYS.map((k) => [k, typeof facts[k] === 'string' ? facts[k].slice(0, 20) : facts[k]]))

  const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json', 'api-revision': '2026-05-20' },
    body: JSON.stringify({
      model: MODEL,
      input: 'Describe this lunar south-pole horizon for a mission planner in two plain sentences. Use only the facts below, '
        + 'quote every number exactly as given (no other numbers, no unit conversions), and say where the Sun and Earth tracks meet the '
        + 'ridgeline. Compass directions are as seen from the landing site.\nFacts: ' + JSON.stringify(clean),
    }),
  })
  if (!upstream.ok) return Response.json({ error: `Gemini answered ${upstream.status}` }, { status: 502 })
  const reply = await upstream.json()
  const text = reply.steps?.flatMap((s) => (s.type === 'model_output' ? s.content ?? [] : [])).find((c) => c.type === 'text')?.text
  if (!text) return Response.json({ error: 'Gemini returned no text' }, { status: 502 })
  return Response.json({ text: String(text).trim().slice(0, 600), model: MODEL, generated: true })
}
