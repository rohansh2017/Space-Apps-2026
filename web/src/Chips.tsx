import type { Evaluation } from './engine/engine'
import { LABELS } from './presets'

/** Pass/fail per constraint. Text carries the state too, so colour is not the only cue. */
export default function Chips({ evaluation }: { evaluation: Evaluation }) {
  return (
    <span className="chips">
      {Object.entries(evaluation.passes).map(([id, pass]) => (
        <span key={id} className={pass ? 'chip pass' : 'chip fail'} title={LABELS[id].name}>
          {pass ? '✓' : '✗'} {LABELS[id].chip}
        </span>
      ))}
    </span>
  )
}
