// F17 shareable URL: ?site=&point=&t=&c=&mode= (plus ?room= from the mission room). Pure; App.tsx validates.
import type { ConstraintDef } from './data'
import type { Constraints } from './engine/engine'

export interface Shared {
  site?: string
  point?: number
  utc?: string
  constraints: Record<string, number | boolean>
  mode?: 'planner' | 'explorer'
  pins: { point: string; hour: number }[] // compare-tray scenarios, "region:index@hour"
}

export function decodeShare(params: URLSearchParams): Shared {
  const out: Shared = { constraints: {}, pins: [] }
  const site = params.get('site')
  if (site) out.site = site
  const point = params.get('point')
  if (point !== null && /^\d+$/.test(point)) out.point = Number(point)
  const t = params.get('t')
  if (t && Number.isFinite(Date.parse(t))) out.utc = t
  for (const pair of (params.get('c') ?? '').split(',').filter(Boolean)) {
    const [k, v] = pair.split(':')
    if (!k || v === undefined) continue
    out.constraints[k] = v === 'true' ? true : v === 'false' ? false : Number(v)
  }
  const mode = params.get('mode')
  if (mode === 'planner' || mode === 'explorer') out.mode = mode
  for (const p of (params.get('pins') ?? '').split(',')) {
    const m = /^([a-z0-9-]+:\d+)@(\d+)$/.exec(p)
    if (m) out.pins.push({ point: m[1], hour: Number(m[2]) })
  }
  return out
}

/** Writes the state into `params`, keeping unrelated keys (room). Only constraints that differ from the defaults are included. */
export function encodeShare(
  params: URLSearchParams,
  s: { site: string; point: number | null; utc: string; constraints: Constraints; defs: ConstraintDef[]; mode: 'planner' | 'explorer'; pins?: { point: string; hour: number }[] },
): URLSearchParams {
  params.set('site', s.site)
  if (s.point === null) params.delete('point')
  else params.set('point', String(s.point))
  params.set('t', s.utc.replace(':00.000Z', 'Z'))
  const changed = s.defs.filter((d) => s.constraints[d.id] !== undefined && s.constraints[d.id] !== d.default).map((d) => `${d.id}:${s.constraints[d.id]}`)
  if (changed.length) params.set('c', changed.join(','))
  else params.delete('c')
  if (s.mode === 'explorer') params.set('mode', 'explorer')
  else params.delete('mode')
  if (s.pins?.length) params.set('pins', s.pins.map((p) => `${p.point}@${p.hour}`).join(','))
  else params.delete('pins')
  return params
}
