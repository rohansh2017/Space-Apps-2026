// F22 horizon description: facts come from the engine, Gemini may put them into words, and any number in
// the reply that is not one of the facts means the template sentence is used instead.
import type { Angles, Prepared } from './engine/engine'
import { nextChange } from './engine/engine'

const COMPASS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west']
export const compass = (azDeg: number) => COMPASS[Math.round((((azDeg % 360) + 360) % 360) / 45) % 8]

export interface HorizonFacts {
  ridge_direction: string // compass sector of the highest terrain
  ridge_elevation_deg: number
  lowest_direction: string
  lowest_elevation_deg: number
  window_hours: number
  sunlit_pct: number
  sun_max_elevation_deg: number
  sun_now: 'up' | 'down'
  sun_direction: string // compass sector of the Sun now
  hours_to_sun_change: number | null // sunset when up, sunrise when down
  sun_change_direction: string | null // where the Sun meets the ridgeline at that change
  earth_now: 'visible' | 'hidden'
  earth_direction: string
  hours_to_earth_change: number | null
  earth_change_direction: string | null
}

/** Engine-derived facts for the observer's window, starting at scrubber position t. */
export function horizonFacts(maskRaw: ArrayLike<number> | null, series: Prepared, track: Angles[], t: number, windowHours: number): HorizonFacts {
  let hi = 0
  let lo = 0
  if (maskRaw) for (let k = 1; k < 360; k++) {
    if (maskRaw[k] > maskRaw[hi]) hi = k
    if (maskRaw[k] < maskRaw[lo]) lo = k
  }
  const el = (k: number) => (maskRaw ? maskRaw[k] * 0.01 - 10 : 0)
  const end = Math.min(series.n, t + windowHours)
  let lit = 0
  let maxEl = -90
  for (let i = t; i < end; i++) {
    lit += series.frac[i]
    if (series.frac[i] > 0 && series.sunEl[i] > maxEl) maxEl = series.sunEl[i]
  }
  const round1 = (v: number) => Math.round(v * 10) / 10
  const sunChange = nextChange(series.litLeft, t)
  const earthChange = nextChange(series.earthLeft, t)
  const at = (h: number | null, az: (a: Angles) => number) => (h !== null && track[t + h] ? compass(az(track[t + h])) : null)
  return {
    ridge_direction: compass(hi), ridge_elevation_deg: round1(el(hi)),
    lowest_direction: compass(lo), lowest_elevation_deg: round1(el(lo)),
    window_hours: end - t, sunlit_pct: Math.round((lit / Math.max(1, end - t)) * 100),
    sun_max_elevation_deg: maxEl > -90 ? round1(maxEl) : 0,
    sun_now: series.lit[t] ? 'up' : 'down', sun_direction: compass(track[t]?.sunAz ?? 0),
    hours_to_sun_change: sunChange, sun_change_direction: at(sunChange, (a) => a.sunAz),
    earth_now: series.earth[t] ? 'visible' : 'hidden', earth_direction: compass(track[t]?.earthAz ?? 0),
    hours_to_earth_change: earthChange, earth_change_direction: at(earthChange, (a) => a.earthAz),
  }
}

const span = (h: number | null) => (h === null ? 'more than 30 days' : h >= 48 ? `${Math.round(h / 24)} days` : `${h} hours`)

/** The fallback sentence, from the same facts. */
export function templateDescription(f: HorizonFacts): string {
  const where = (d: string | null) => (d ? ` toward the ${d}` : '')
  const sun = f.sun_now === 'up'
    ? `The Sun is above the ridge in the ${f.sun_direction} now and sets in ${span(f.hours_to_sun_change)}${where(f.sun_change_direction)}`
    : `The Sun is behind the terrain in the ${f.sun_direction} now and rises in ${span(f.hours_to_sun_change)}${where(f.sun_change_direction)}`
  const earth = f.earth_now === 'visible'
    ? `Earth is in view in the ${f.earth_direction} and sets in ${span(f.hours_to_earth_change)}${where(f.earth_change_direction)}`
    : `Earth is below the ridge in the ${f.earth_direction} and rises in ${span(f.hours_to_earth_change)}${where(f.earth_change_direction)}`
  return `The skyline is highest toward the ${f.ridge_direction}, ${f.ridge_elevation_deg}° up, and lowest toward the ${f.lowest_direction} at ${f.lowest_elevation_deg}°. `
    + `Over the next ${span(f.window_hours)} the Sun clears it ${f.sunlit_pct}% of the time, never more than ${f.sun_max_elevation_deg}° high. ${sun}; ${earth}.`
}

/** Numbers Gemini may use: every numeric fact, its rounded forms, and day/hour conversions of the countdowns. */
export function allowedNumbers(f: HorizonFacts): Set<string> {
  const out = new Set<string>()
  const add = (v: number | null) => {
    if (v === null) return
    for (const s of [String(v), v.toFixed(0), v.toFixed(1), Math.round(v).toString()]) out.add(s.replace(/\.0$/, ''))
  }
  for (const v of [f.ridge_elevation_deg, f.lowest_elevation_deg, f.window_hours, f.sunlit_pct, f.sun_max_elevation_deg]) add(v)
  for (const h of [f.hours_to_sun_change, f.hours_to_earth_change, f.window_hours]) {
    add(h)
    if (h !== null) {
      add(Math.round(h / 24))
      add(Math.round((h / 24) * 10) / 10)
      add(Math.floor(h / 24))
      add(h % 24)
    }
  }
  out.add('30') // "more than 30 days"
  return out
}

/** True when every number in the text is one of the facts. */
export function numbersCheck(text: string, f: HorizonFacts): boolean {
  const allowed = allowedNumbers(f)
  return (text.match(/-?\d+(?:\.\d+)?/g) ?? []).every((n) => allowed.has(n.replace(/^-/, '').replace(/\.0$/, '')) || allowed.has(n))
}

/** A reply that refuses or talks about the task instead of the horizon is not a description. */
export function looksLikeDescription(text: string): boolean {
  return text.length > 30 && /\b(sun|earth|ridge|skyline|horizon)\b/i.test(text) && !/\b(cannot|can't|unable|not (?:contain|possible|provided)|as specified|the facts do not)\b/i.test(text)
}

export async function askDescription(facts: HorizonFacts): Promise<string> {
  const r = await fetch('/api/describe', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facts }) })
  const body = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`)
  return String(body.text ?? '')
}
