// F28 first-visit tutorial (D65): four one-click actions and a closing card, about 30 seconds. Each step points at
// a real control ([data-tour=…]) and moves on by itself once the app's state shows the user did it.

/** The bits of app state the tutorial watches. `found` is the search result object, compared by identity. */
export interface Snapshot {
  stageView: 'moon' | 'ground'
  moonZoom: boolean
  offset: number
  playing: boolean
  found: object | null
}

export type Prepare = 'moon' | 'plan-panel'

export interface CoachStep {
  id: string
  title: string
  body: string
  target: string | null // [data-tour] value to highlight; null = a centred card
  prepare?: Prepare // what the app must show before the step
  done?: (now: Snapshot, start: Snapshot) => boolean // absent: the step waits for Finish
}

export const COACH_STEPS: CoachStep[] = [
  {
    id: 'fly', title: 'Welcome to Tranquility Base',
    body: 'Click a pin to fly down to that landing site.',
    target: 'site-pin', prepare: 'moon',
    done: (s) => s.moonZoom,
  },
  {
    id: 'sun', title: 'Watch the Sun',
    body: 'Press Play: at the pole the Sun skims the horizon instead of rising.',
    target: 'play',
    done: (s, start) => s.playing || s.offset !== start.offset,
  },
  {
    id: 'stand', title: 'Stand on the surface',
    body: 'See the real terrain and horizon in 3D.',
    target: 'stand',
    done: (s) => s.stageView === 'ground',
  },
  {
    id: 'find', title: 'Launch slipped?',
    body: 'One click ranks nearby sites and later dates that still work.',
    target: 'find', prepare: 'plan-panel',
    done: (s, start) => s.found !== null && s.found !== start.found, // a new search, not results already on screen
  },
  {
    id: 'end', title: 'You’re set',
    body: 'Next: pin results to compare, ask Gemini, or share a link or mission room.',
    target: null,
  },
]

export const ONBOARDED_KEY = 'tranquility-base:onboarded'
const SHARED_KEYS = ['site', 'point', 't', 'c', 'pins', 'ref', 'room']

/** Open by itself only for a first-time visitor on the bare address; `?tour=1` always opens it. */
export function shouldAutoOpen(params: URLSearchParams, onboarded: boolean, automated: boolean): boolean {
  if (params.get('tour') === '1') return true
  return !onboarded && !automated && !SHARED_KEYS.some((k) => params.has(k))
}
