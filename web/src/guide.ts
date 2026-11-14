import { createContext } from 'react'

export type Mode = 'planner' | 'explorer'

/** Mode and glossary (from tour.json) for the whole app. */
export const Guide = createContext<{ mode: Mode; glossary: Map<string, string> }>({ mode: 'planner', glossary: new Map() })

/** Explorer wording for the Sun visible fraction. */
export function sunWords(lit: number): string {
  if (lit <= 0) return 'The Sun is behind the terrain'
  if (lit >= 0.995) return 'The whole Sun is above the ridge'
  if (lit > 0.4 && lit < 0.6) return 'Half the Sun is behind the ridge'
  return `${(lit * 100).toFixed(0)}% of the Sun is above the ridge`
}
