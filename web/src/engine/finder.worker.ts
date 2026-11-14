import type { Constraints } from './engine'
import type { Candidate } from './finder'
import { runFinder } from './finder'

export interface FinderRequest {
  table: Float32Array
  tableHours: number
  candidates: Candidate[]
  start: number
  constraints: Constraints
}

self.onmessage = (e: MessageEvent<FinderRequest>) => {
  const { table, tableHours, candidates, start, constraints } = e.data
  try {
    self.postMessage({ ok: true, result: runFinder(table, tableHours, candidates, start, constraints) })
  } catch (err) {
    self.postMessage({ ok: false, error: String(err) })
  }
}
