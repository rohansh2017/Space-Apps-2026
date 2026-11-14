// F24 mission room client: share site, point, landing time and constraints over the Worker's WebSocket.
import type { ConstraintDef } from './data'
import type { Constraints } from './engine/engine'

export interface RoomState {
  site_id: string
  point_index: number | null
  utc: string
  constraints: Constraints
}

export const SENDER = Math.random().toString(36).slice(2, 10)
const ID = /^[a-z0-9][a-z0-9-]{2,39}$/

export const roomIdFromUrl = (): string | null => {
  const id = new URLSearchParams(window.location.search).get('room')
  return id && ID.test(id) ? id : null
}

export const newRoomId = (): string => `tb-${Math.random().toString(36).slice(2, 8)}`

export const roomLink = (id: string): string => {
  const url = new URL(window.location.href)
  url.searchParams.set('room', id)
  return url.toString()
}

/** Keep only schema-valid values from a state received over the wire; anything else falls back to the default. */
export function validConstraints(defs: ConstraintDef[], raw: unknown): Constraints {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return Object.fromEntries(defs.map((d) => {
    const v = r[d.id]
    const ok = d.type === 'boolean' ? typeof v === 'boolean' : typeof v === 'number' && Number.isFinite(v) && v >= d.min! && v <= d.max!
    return [d.id, ok ? (v as number | boolean) : d.default]
  }))
}

export const stateKey = (s: RoomState): string => JSON.stringify([s.site_id, s.point_index, s.utc, s.constraints])

export interface Room {
  send(state: RoomState): void
  close(): void
}

export function connectRoom(id: string, onState: (s: RoomState) => void, onCount: (n: number) => void): Room {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const ws = new WebSocket(`${proto}://${window.location.host}/room/${id}`)
  let queued: RoomState | null = null
  ws.onopen = () => {
    if (queued) ws.send(JSON.stringify({ type: 'state', sender: SENDER, ...queued }))
    queued = null
  }
  ws.onmessage = (e) => {
    let msg: { type?: string; sender?: string; count?: number } & Partial<RoomState>
    try {
      msg = JSON.parse(String(e.data))
    } catch {
      return
    }
    if (msg.type === 'presence' && typeof msg.count === 'number') onCount(msg.count)
    if (msg.type === 'state' && msg.sender !== SENDER && typeof msg.site_id === 'string' && typeof msg.utc === 'string')
      onState({ site_id: msg.site_id, point_index: Number.isInteger(msg.point_index) ? (msg.point_index as number) : null, utc: msg.utc, constraints: (msg.constraints ?? {}) as Constraints })
  }
  ws.onclose = () => onCount(0)
  return {
    send(state) {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'state', sender: SENDER, ...state }))
      else queued = state
    },
    close: () => ws.close(),
  }
}
