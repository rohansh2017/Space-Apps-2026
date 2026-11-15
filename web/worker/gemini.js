// F21 grounded extraction, shared by the copilot route (worker/copilot.js; one route since D70): Gemini lists
// {quote, field, value} items (fields from constraints.schema.json); the Worker keeps only items whose quote is in
// the sentence (D64), and the browser validates the values against the schema before anything is applied. Gemini
// never sees engine results. The key is a Worker secret (GEMINI_API_KEY).

const MAX_CHARS = 300
export const UNITS = 'Phrases: dark/night/no sun -> max_continuous_dark_hours (hours; 4 days = 96); talk to/see/contact Earth, comms -> min_earth_visible_pct '
  + '(percent; half the time = 50); sunlight/power -> min_continuous_sun_days (days); mission length -> mission_duration_days; '
  + 'slope -> max_slope_deg (degrees); launch delay -> slip_range_days only if a search range is stated.'
export const ITEMS = 'List one item per constraint the text states: quote = the exact words from the text that state it, field, value in '
  + 'the unit of that field (true/false as 1/0). Never list a field the text does not state, and never use one phrase for two fields.'

export async function constraintDefs(request, env) {
  return (await (await env.ASSETS.fetch(new URL('/data/constraints.schema.json', request.url))).json()).constraints
}

/** Grounded extraction (D64): each value must quote the user's words, so a lite model cannot invent fields. */
export function itemsSchema(defs) {
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: { quote: { type: 'string' }, field: { type: 'string', enum: defs.map((d) => d.id) }, value: { type: 'number' } },
      required: ['quote', 'field', 'value'],
    },
  }
}

// lower case, punctuation to spaces; a dot survives only as a decimal point (8.5)
export const norm = (t) => String(t).toLowerCase().replace(/(?<!\d)\.|\.(?!\d)/g, ' ').replace(/[^a-z0-9%.°]+/g, ' ').trim()

/** The quote, normalised, if it is in the sentence as whole words; otherwise null. */
export function quoted(quote, sentence) {
  const q = norm(quote ?? '')
  return q && ` ${norm(sentence)} `.includes(` ${q} `) ? q : null
}

/** True (and the quote is recorded) unless it shares words with a quote already used: one phrase, one meaning. */
export function claim(q, used) {
  if (used.some((u) => u.includes(q) || q.includes(u))) return false
  used.push(q)
  return true
}

/** Keep an item only if its quote is in the sentence and no other kept item uses the same words; ranges are the browser's check. */
export function groundedValues(items, sentence, defs, used = []) {
  const values = {}
  for (const it of Array.isArray(items) ? items : []) {
    const d = defs.find((x) => x.id === it?.field)
    const q = quoted(it?.quote, sentence)
    if (!d || !q || d.id in values || typeof it.value !== 'number') continue
    if (!claim(q, used)) continue // "4 days of dark" cannot also be a 4-day mission
    values[d.id] = d.type === 'boolean' ? it.value !== 0 : it.value
  }
  return values
}

/** The sentence from a parsed request body, or null if it is empty or too long. */
export function sentenceFrom(body) {
  const sentence = String(body?.sentence ?? '').trim()
  return sentence && sentence.length <= MAX_CHARS ? sentence : null
}
