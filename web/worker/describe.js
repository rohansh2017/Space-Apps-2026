// F22: a short plain-language description of the horizon panorama, written from engine-derived facts.
// Gemini sees the facts only (never engine series or results); the browser checks every number in the
// reply against the facts and falls back to a template sentence otherwise.
import { callGemini, gate, readJson } from './gemini-call.js'

const KEYS = ['ridge_direction', 'ridge_elevation_deg', 'lowest_direction', 'lowest_elevation_deg', 'window_hours', 'sunlit_pct',
  'sun_max_elevation_deg', 'sun_now', 'sun_direction', 'hours_to_sun_change', 'sun_change_direction',
  'earth_now', 'earth_direction', 'hours_to_earth_change', 'earth_change_direction']

export async function describeHorizon(request, env) {
  const stop = gate(request, env, 'Horizon description')
  if (stop) return stop
  const facts = (await readJson(request))?.facts
  if (!facts || typeof facts !== 'object' || !KEYS.every((k) => k in facts)) return Response.json({ error: 'facts are incomplete' }, { status: 400 })
  const clean = Object.fromEntries(KEYS.map((k) => [k, typeof facts[k] === 'string' ? facts[k].slice(0, 20) : facts[k]]))

  const r = await callGemini(env,
    'Write two plain sentences describing this lunar south-pole horizon for a mission planner: where the skyline is high and low, '
      + 'where the Sun and Earth are against it now, and where and when each next meets the ridgeline (sunset/sunrise, Earthset/Earthrise). '
      + 'Use only the facts below and quote every number exactly as given (no other numbers, no unit conversions). hours_to_* are hours; '
      + 'null means no change within 30 days. Compass directions are as seen from the site. Never comment on the task or the facts; '
      + 'if something is unknown, leave it out.\nFacts: ' + JSON.stringify(clean),
  )
  if (r.error) return Response.json({ error: r.error }, { status: r.status })
  return Response.json({ text: r.text.trim().slice(0, 600), model: r.model, generated: true })
}
