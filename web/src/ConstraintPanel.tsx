import type { ConstraintDef } from './data'
import type { Constraints } from './engine/engine'
import { LABELS, PRESETS, defaults } from './presets'
import SentenceEntry from './SentenceEntry'

interface Props {
  defs: ConstraintDef[]
  value: Constraints
  onChange: (c: Constraints) => void
}

export default function ConstraintPanel({ defs, value, onChange }: Props) {
  return (
    <section className="panel" aria-label="Constraints">
      <h2>Constraints</h2>
      <div className="presets">
        {Object.entries(PRESETS).map(([name, preset]) => (
          <button key={name} type="button" onClick={() => onChange({ ...defaults(defs), ...preset })}>{name}</button>
        ))}
      </div>
      {defs.map((d) =>
        d.type === 'boolean' ? (
          <label key={d.id} className="row check">
            <input type="checkbox" checked={Boolean(value[d.id])} onChange={(e) => onChange({ ...value, [d.id]: e.target.checked })} />
            {LABELS[d.id].name}
          </label>
        ) : (
          <label key={d.id} className="row">
            <span>{LABELS[d.id].name}</span>
            <span className="field">
              <input
                type="number"
                min={d.min!}
                max={d.max!}
                value={Number(value[d.id])}
                onChange={(e) => {
                  // out-of-range or empty input is ignored, so the engine only ever sees schema-valid values
                  const v = e.target.valueAsNumber
                  if (Number.isFinite(v) && v >= d.min! && v <= d.max!) onChange({ ...value, [d.id]: v })
                }}
              />
              {d.unit}
            </span>
          </label>
        ),
      )}
      <p className="note">Defaults are editable placeholders, not NASA requirements.</p>
      <SentenceEntry defs={defs} onApply={(v) => onChange({ ...value, ...v })} />
    </section>
  )
}
