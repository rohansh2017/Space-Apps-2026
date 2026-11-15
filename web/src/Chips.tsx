import { Check, X } from 'lucide-react'
import type { Constraints, Evaluation } from './engine/engine'
import { LABELS } from './presets'

/** The requirement each chip tests, in words (the bundled face has no ≤ / ≥): "6 d min", "80 h max". */
function threshold(id: string, c: Constraints): string {
  switch (id) {
    case 'min_continuous_sun_days': return `${c[id]} d min`
    case 'max_continuous_dark_hours': return `${c[id]} h max`
    case 'min_earth_visible_pct': return `${c[id]}% min`
    case 'max_slope_deg': return `${c[id]}° max`
    default: return ''
  }
}

interface Props {
  evaluation: Evaluation
  constraints: Constraints // the values this evaluation was made with
  failedOnly?: boolean // compact form for the compare tray: a pass count plus the failing chips
}

/** Pass/fail per constraint with its threshold. Text carries the state too, so colour is not the only cue. */
export default function Chips({ evaluation, constraints, failedOnly = false }: Props) {
  const entries = Object.entries(evaluation.passes)
  const shown = failedOnly ? entries.filter(([, pass]) => !pass) : entries
  return (
    <span className="chips">
      {failedOnly && (
        <span className={evaluation.fails ? 'tally' : 'tally all'} data-testid="tally">
          {entries.length - evaluation.fails} of {entries.length} met
        </span>
      )}
      {shown.map(([id, pass]) => (
        <span key={id} className={pass ? 'chip pass' : 'chip fail'} title={`${LABELS[id].name}: ${pass ? 'passes' : 'fails'}`}>
          {pass ? <Check size={12} strokeWidth={2.5} aria-hidden="true" /> : <X size={12} strokeWidth={2.5} aria-hidden="true" />}
          <span className="sr-only">{pass ? 'Passes' : 'Fails'}:</span>
          {id === 'landing_sun_and_earth_visible' ? 'Sun + Earth at landing' : `${LABELS[id].chip} ${threshold(id, constraints)}`}
        </span>
      ))}
    </span>
  )
}
