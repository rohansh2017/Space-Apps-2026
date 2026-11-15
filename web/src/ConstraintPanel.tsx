import { useEffect, useRef, useState } from 'react'
import type { CopilotHooks } from './copilot'
import type { ConstraintDef } from './data'
import type { Constraints } from './engine/engine'
import { LABELS, PRESETS, defaults } from './presets'
import SentenceEntry from './SentenceEntry'

interface Props {
  defs: ConstraintDef[]
  value: Constraints
  onChange: (c: Constraints) => void
  copilot?: CopilotHooks // F21/F26/F29: the Gemini sentence box's view of the app (absent while loading)
}

/** Why a typed value cannot be used, or null when it is valid. */
function problem(d: ConstraintDef, text: string): string | null {
  if (text.trim() === '') return `Enter a number from ${d.min} to ${d.max} ${d.unit}.`
  const v = Number(text)
  if (!Number.isFinite(v)) return `"${text}" is not a number. Enter ${d.min} to ${d.max} ${d.unit}.`
  if (v < d.min! || v > d.max!) return `${v} ${d.unit} is outside the allowed range: enter ${d.min} to ${d.max} ${d.unit}.`
  return null
}

export default function ConstraintPanel({ defs, value, onChange, copilot }: Props) {
  // what the user typed, kept while it is not a valid value; the engine only ever sees schema-valid values
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  // a value changed from elsewhere (preset, sentence, mission room) replaces any draft for that field
  const previous = useRef(value)
  useEffect(() => {
    const changed = Object.keys(value).filter((k) => value[k] !== previous.current[k])
    previous.current = value
    if (changed.length) setDrafts((all) => Object.fromEntries(Object.entries(all).filter(([k]) => !changed.includes(k))))
  }, [value])

  return (
    <section className="panel" aria-label="Constraints">
      <h2>Constraints</h2>
      <div className="presets">
        {Object.entries(PRESETS).map(([name, preset]) => (
          <button key={name} type="button" onClick={() => { setDrafts({}); onChange({ ...defaults(defs), ...preset }) }}>{name}</button>
        ))}
      </div>
      {defs.map((d) => {
        if (d.type === 'boolean')
          return (
            <label key={d.id} className="row check">
              <input type="checkbox" checked={Boolean(value[d.id])} onChange={(e) => onChange({ ...value, [d.id]: e.target.checked })} />
              {LABELS[d.id].name}
            </label>
          )
        const draft = drafts[d.id]
        const error = draft === undefined ? null : problem(d, draft)
        const errorId = `constraint-error-${d.id}`
        return (
          <div key={d.id} className="row">
            <label htmlFor={`constraint-${d.id}`}>{LABELS[d.id].name}</label>
            <span className="field">
              <input
                id={`constraint-${d.id}`}
                type="number"
                min={d.min!}
                max={d.max!}
                value={draft ?? Number(value[d.id])}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? errorId : undefined}
                onChange={(e) => {
                  const text = e.target.value
                  if (problem(d, text)) setDrafts({ ...drafts, [d.id]: text })
                  else {
                    setDrafts(Object.fromEntries(Object.entries(drafts).filter(([k]) => k !== d.id)))
                    onChange({ ...value, [d.id]: Number(text) })
                  }
                }}
              />
              {d.unit}
            </span>
            {error && (
              <span className="field-error" id={errorId} data-testid="constraint-error">
                {error} The search keeps using {String(value[d.id])} {d.unit}.
              </span>
            )}
          </div>
        )
      })}
      <p className="note">Defaults are editable placeholders, not NASA requirements.</p>
      {copilot && <SentenceEntry defs={defs} copilot={{ ...copilot, apply: (p) => { setDrafts({}); copilot.apply(p) } }} />}
    </section>
  )
}
