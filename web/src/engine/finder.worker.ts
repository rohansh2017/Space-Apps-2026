import type { Constraints } from './engine'
import type { Candidate, FinderOptions } from './finder'
import { runFinder } from './finder'

export interface FinderRequest {
  table: Float32Array
  tableHours: number
  candidates: Candidate[]
  start: number
  constraints: Constraints
  options?: FinderOptions // F29: order and search window from the copilot
}

self.onmessage = (e: MessageEvent<FinderRequest>) => {
  const { table, tableHours, candidates, start, constraints, options } = e.data
  try {
    self.postMessage({ ok: true, result: runFinder(table, tableHours, candidates, start, constraints, {}, 10, options) })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) })
  }
}
