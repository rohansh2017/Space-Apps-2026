// F26 slip copilot: ONE Gemini call turns a slip scenario into {constraints, slip_days, site}. The browser
// validates it, the user confirms, and the engine's finder does all the work; the answer is a template
// built from the finder's result, so no second call (D63: tokens are limited, no agent loop).
import { callGemini, gate } from './gemini-call.js'
import { ITEMS, UNITS, constraintDefs, groundedValues, itemsSchema, readSentence } from './gemini.js'

export async function planSlip(request, env) {
  const stop = gate(request, env, 'The slip copilot')
  if (stop) return stop
  const sentence = await readSentence(request)
  if (!sentence) return Response.json({ error: 'Write 1 to 300 characters' }, { status: 400 })
  const defs = await constraintDefs(request, env)
  const sites = (await (await env.ASSETS.fetch(new URL('/data/sites.json', request.url))).json()).sites.filter((s) => s.terrain)
  const schema = {
    type: 'object',
    properties: {
      constraints: itemsSchema(defs),
      slip_days: { type: 'number', minimum: 0, maximum: 30 },
      site: { type: 'string', enum: sites.map((s) => s.id) },
    },
    additionalProperties: false,
  }
  const r = await callGemini(env,
    `A lunar south-pole landing is being replanned. From the message, give: constraints (${ITEMS}), slip_days `
      + `(how many days later the earliest landing now is; leave out if not stated), site (only if it names one of: `
      + `${sites.map((s) => `${s.id}=${s.name}`).join('; ')}). ${UNITS}\nMessage: ${sentence}`,
    { schema })
  if (r.error) return Response.json({ error: r.error }, { status: r.status })
  let plan
  try {
    plan = JSON.parse(r.text)
  } catch {
    return Response.json({ error: 'Gemini did not return JSON' }, { status: 502 })
  }
  if (plan && typeof plan === 'object') plan.constraints = groundedValues(plan.constraints, sentence, defs)
  return Response.json({ plan, model: r.model, generated: true })
}
