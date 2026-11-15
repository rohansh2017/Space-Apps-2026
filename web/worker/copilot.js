// F26/F29 slip copilot: ONE Gemini call turns a slip scenario into a search spec {slip, where, when, constraints}.
// Every part quotes the user's words and is kept only if the quote is in the sentence (D64, generalised in D69).
// The browser validates the values, the user confirms, and the engine's finder does all the work; the answer is a
// template built from the finder's result, so no second call (D63: tokens are limited, no agent loop).
import { callGemini, gate, readJson } from './gemini-call.js'
import { ITEMS, UNITS, claim, constraintDefs, groundedValues, itemsSchema, quoted, sentenceFrom } from './gemini.js'

// the search window is `when` here, so the copilot never sees slip_range_days (an 11-day slip is not an 11-day window)
const COPILOT_UNITS = UNITS.replace(/; launch delay -> slip_range_days[^.]*\./, '.')

/** Keep each part only if its quote is in the sentence and shares no words with a part already kept. */
export function groundPlan(plan, sentence, defs) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return plan
  const used = []
  const out = {}
  for (const key of ['slip', 'where', 'when']) {
    const part = plan[key]
    if (!part || typeof part !== 'object') continue
    const q = quoted(part.quote, sentence)
    if (q && claim(q, used)) out[key] = part
  }
  out.constraints = groundedValues(plan.constraints, sentence, defs, used)
  return out
}

export function copilotSchema(defs, sites) {
  const ids = sites.map((s) => s.id)
  return {
    type: 'object',
    properties: {
      slip: {
        type: 'object',
        properties: { days: { type: 'number', minimum: 0, maximum: 30 }, quote: { type: 'string' } },
        required: ['days', 'quote'],
      },
      where: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['current', 'sites', 'all'] },
          sites: { type: 'array', items: { type: 'string', enum: ids } },
          within_km: { type: 'number', minimum: 0, maximum: 5 },
          quote: { type: 'string' },
        },
        required: ['scope', 'quote'],
      },
      when: {
        type: 'object',
        properties: {
          order: { type: 'string', enum: ['earliest', 'best_margin'] },
          land_by_utc: { type: 'string' },
          window_days: { type: 'number', minimum: 0, maximum: 30 },
          quote: { type: 'string' },
        },
        required: ['quote'],
      },
      constraints: itemsSchema(defs),
    },
    // every part is required (a lite model skips optional objects, D69); quote "" means the message does not state it
    required: ['slip', 'where', 'when', 'constraints'],
    additionalProperties: false,
  }
}

export function copilotPrompt(sentence, sites, current, planUtc) {
  return 'A lunar south-pole landing is being replanned. Read the message into these parts. Each part has quote = the exact words '
    + 'of the message that state it; if the message does not state a part, give quote "" for it. No two parts may quote the same words.\n'
    + 'slip: days = how much later the landing now is (a slip, delay or postponement; 2 weeks = 14, 36 hours = 1.5).\n'
    + 'where: where to search. scope "current" = stay at or near the current site (also "the site", "the rim", "here", "nearby" with no other name); '
    + '"sites" = the sites the message names, as ids in sites; "all" = any site, anywhere. within_km only if a distance is stated.\n'
    + 'when: give it whenever the message says when to land, apart from the slip. order "earliest" for "soonest", "as soon as possible", '
    + '"earliest", "first chance"; "best_margin" for "best conditions", "safest". land_by_utc (ISO date) for "land by 20 Dec", "before the 20th", '
    + '"no later than"; window_days for "within 10 days", "search a week". Never put the slip here.\n'
    + 'Example: "slipped a week, near the site, as soon as possible, land by 9 Jan" -> slip {days 7, quote "slipped a week"}, '
    + 'where {scope "current", quote "near the site"}, when {order "earliest", land_by_utc "<year>-01-09", quote "as soon as possible, land by 9 Jan"}.\n'
    + `constraints: ${ITEMS} ${COPILOT_UNITS}\n`
    + `Sites (id = name): ${sites.map((s) => `${s.id} = ${s.name}`).join('; ')}.\n`
    + `Current plan: ${current ? `${current.name} (${current.id})` : 'unknown site'}, landing ${planUtc ?? 'unknown'} UTC.\n`
    + `Message: ${sentence}`
}

export async function planSlip(request, env) {
  const stop = gate(request, env, 'The slip copilot')
  if (stop) return stop
  const body = await readJson(request)
  const sentence = sentenceFrom(body)
  if (!sentence) return Response.json({ error: 'Write 1 to 300 characters' }, { status: 400 })
  const defs = (await constraintDefs(request, env)).filter((d) => d.id !== 'slip_range_days')
  const sites = (await (await env.ASSETS.fetch(new URL('/data/sites.json', request.url))).json()).sites.filter((s) => s.terrain)
  const current = sites.find((s) => s.id === body?.site_id) ?? null
  const planUtc = typeof body?.plan_utc === 'string' && !Number.isNaN(Date.parse(body.plan_utc)) ? body.plan_utc : null
  const r = await callGemini(env, copilotPrompt(sentence, sites, current, planUtc), { schema: copilotSchema(defs, sites) })
  if (r.error) return Response.json({ error: r.error }, { status: r.status })
  let plan
  try {
    plan = JSON.parse(r.text)
  } catch {
    return Response.json({ error: 'Gemini did not return JSON' }, { status: 502 })
  }
  return Response.json({ plan: groundPlan(plan, sentence, defs), model: r.model, generated: true })
}
