import type { Constraints, Evaluation } from './engine/engine'
import { LABELS } from './presets'

/** The requirement each chip tests, from the constraint values in force: "≥ 6 d", "≤ 80 h". */
function threshold(id: string, c: Constraints): string {
  switch (id) {
    case 'min_continuous_sun_days': return `≥ ${c[id]} d`
    case 'max_continuous_dark_hours': return `≤ ${c[id]} h`
    case 'min_earth_visible_pct': return `≥ ${c[id]}%`
    case 'max_slope_deg': return `≤ ${c[id]}°`
    default: return ''
  }
}

interface Props {
  evaluation: Evaluation
  constraints: Constraints // the values this evaluation was made with
}

/** Pass/fail per constraint with its threshold. Text carries the state too, so colour is not the only cue. */
export default function Chips({ evaluation, constraints }: Props) {
  return (
    <span className="chips">
      {Object.entries(evaluation.passes).map(([id, pass]) => (
        <span key={id} className={pass ? 'chip pass' : 'chip fail'} title={`${LABELS[id].name}: ${pass ? 'passes' : 'fails'}`}>
          <span aria-hidden="true">{pass ? '✓' : '✗'}</span>
          <span className="sr-only">{pass ? 'Passes' : 'Fails'}:</span>{' '}
          {id === 'landing_sun_and_earth_visible' ? 'Sun + Earth at landing' : `${LABELS[id].chip} ${threshold(id, constraints)}`}
        </span>
      ))}
    </span>
  )
}
