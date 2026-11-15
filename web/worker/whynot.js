// F27: on request only, one plain sentence rephrasing the engine's "why not" facts. The browser shows its own
// template by default and keeps this reply only if every number in it is one of the facts.
import { callGemini, gate, readJson } from './gemini-call.js'

export async function explainWhyNot(request, env) {
  const stop = gate(request, env, 'The why-not explainer')
  if (stop) return stop
  const facts = (await readJson(request))?.facts
  if (!facts || !Array.isArray(facts.fails) || !Array.isArray(facts.relax_to)) return Response.json({ error: 'facts are incomplete' }, { status: 400 })
  const clean = JSON.stringify(facts).slice(0, 800)
  const r = await callGemini(env,
    'In one or two plain sentences for a lunar mission planner, say why this landing plan fails and the simplest change that makes it pass. '
      + 'Use only these facts and quote numbers exactly as given; later_* is how much later the same point passes (null: not within the slip range). '
      + 'No other numbers, no comments on the task.\nFacts: ' + clean,
  )
  if (r.error) return Response.json({ error: r.error }, { status: r.status })
  return Response.json({ text: r.text.trim().slice(0, 500), model: r.model, generated: true })
}
