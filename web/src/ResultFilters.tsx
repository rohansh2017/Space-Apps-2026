// F30: the Alternatives panel's filter menu (hidden by default) and the removable pills for active filters.
import { RefreshCw, X } from 'lucide-react'
import type { ConstraintDef } from './data'
import type { Constraints } from './engine/engine'
import type { Candidate } from './engine/finder'
import type { ResultFilter, Row } from './resultFilter'
import { NO_FILTER, SLIDERS, criterion, meets, overridesOf, pillsOf, sameSet, thresholdOf, thresholdText } from './resultFilter'

const fmt = (v: number) => String(Number(v.toFixed(1)))

/** Active filters as removable pills, shown whether or not the menu is open. */
export function FilterPills({ filter, onChange, constraints }: { filter: ResultFilter; onChange: (f: ResultFilter) => void; constraints: Constraints }) {
  const pills = pillsOf(filter, constraints)
  if (!pills.length) return null
  return (
    <div className="filter-pills" data-testid="filter-pills">
      {pills.map((p) => (
        <button key={p.key} type="button" className="filter-pill" aria-label={`Remove filter: ${p.text}`} onClick={() => onChange(p.remove)}>
          {p.text}<X size={12} aria-hidden="true" />
        </button>
      ))}
      <button type="button" className="link-button" onClick={() => onChange({ ...NO_FILTER, sort: filter.sort })}>Clear all</button>
    </div>
  )
}

interface Props {
  id: string
  filter: ResultFilter
  onChange: (f: ResultFilter) => void
  onClose: () => void
  sites: string[] // site names present in this search's results
  criteria: string[] // constraint ids the results are tested against
  maxDays: number // the search's slip range
  rankedOn: string[] | null // F31: the constraints the current results were ranked on (null: all)
  busy: boolean
  onRecompute: (only: string[] | null, overrides: Record<string, number>) => void // F32: overrides go into the Constraints panel
  rows: Row[] // F32: the whole pool, for the sliders' ranges and counts
  candidates: Candidate[]
  constraints: Constraints // the values this search ran with
  defs: ConstraintDef[] // slider ends
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export default function ResultFilters({ id, filter: f, onChange, onClose, sites, criteria, maxDays, rankedOn, busy, onRecompute, rows, candidates, constraints, defs }: Props) {
  // F31: recompute ranks on the ticked criteria alone; pressed again, it goes back to every criterion
  const ticked = f.allPass ? [] : f.mustPass
  const canFocus = ticked.length > 0 && ticked.length < criteria.length
  // F32: slider values that differ from the search's constraints; Recompute writes them into the Constraints panel
  const overrides = overridesOf(f, constraints)
  const tuned = Object.keys(overrides).length > 0
  const changed = rankedOn !== null && ((canFocus && !sameSet(ticked, rankedOn)) || tuned)
  const only = canFocus ? ticked : null
  const kmMax = Math.max(0.5, Math.ceil(Math.max(0, ...rows.map((x) => x.km)) * 2) / 2)
  const daysTop = Math.max(0.5, maxDays)
  const tunedText = Object.entries(overrides).map(([k, v]) => thresholdText(k, v)).join(', ')
  return (
    <div id={id} className="results-filter" role="group" aria-label="Filter the alternatives" data-testid="results-filter">
      <div className="results-filter-head">
        <span>Filters</span>
        <button type="button" className="icon-button" aria-label="Hide filters" title="Hide filters" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <fieldset>
        <legend>Days out <span className="legend-note">after the planned landing</span></legend>
        <div className="filter-slider">
          <span className="filter-slider-value" data-testid="days-value">
            {f.minDays === null && f.maxDays === null ? 'Any' : `${fmt(f.minDays ?? 0)} to ${fmt(f.maxDays ?? daysTop)} days`}
          </span>
          <label className="filter-slider-row"><span>From</span>
            <input type="range" min={0} max={daysTop} step={0.5} aria-label="Minimum days out" value={f.minDays ?? 0}
              aria-valuetext={`${fmt(f.minDays ?? 0)} days`}
              onChange={(e) => {
                const v = Number(e.target.value)
                onChange({ ...f, minDays: v <= 0 ? null : v, maxDays: f.maxDays !== null && f.maxDays < v ? v : f.maxDays })
              }} />
          </label>
          <label className="filter-slider-row"><span>To</span>
            <input type="range" min={0} max={daysTop} step={0.5} aria-label="Maximum days out" value={f.maxDays ?? daysTop}
              aria-valuetext={`${fmt(f.maxDays ?? daysTop)} days`}
              onChange={(e) => {
                const v = Number(e.target.value)
                onChange({ ...f, maxDays: v >= daysTop ? null : v, minDays: f.minDays !== null && f.minDays > v ? (v <= 0 ? null : v) : f.minDays })
              }} />
          </label>
        </div>
      </fieldset>
      <fieldset>
        <legend>Distance from plan</legend>
        <div className="filter-slider">
          <span className="filter-slider-value" data-testid="km-value">{f.maxKm === null ? 'Any' : `Within ${fmt(f.maxKm)} km`}</span>
          <input type="range" min={0} max={kmMax} step={0.5} aria-label="Maximum distance from the plan in km" value={f.maxKm ?? kmMax}
            aria-valuetext={f.maxKm === null ? 'any distance' : `${fmt(f.maxKm)} km`}
            onChange={(e) => { const v = Number(e.target.value); onChange({ ...f, maxKm: v >= kmMax ? null : v }) }} />
        </div>
      </fieldset>
      {sites.length > 1 && (
        <fieldset>
          <legend>Site</legend>
          <div className="filter-list">
            {sites.map((s) => (
              <label key={s} className="filter-check">
                <input type="checkbox" checked={f.sites.includes(s)} onChange={() => onChange({ ...f, sites: toggle(f.sites, s) })} />{s}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend>Criteria met</legend>
        <label className="filter-check">
          <input type="checkbox" checked={f.allPass} onChange={() => onChange({ ...f, allPass: !f.allPass })} />Meets every constraint
        </label>
        {criteria.map((c) => {
          const on = !f.allPass && f.mustPass.includes(c)
          const s = SLIDERS[c]
          const def = defs.find((d) => d.id === c)
          const v = thresholdOf(f, c, constraints)
          const kept = on && s ? rows.filter((x) => meets(c, x.r, candidates[x.r.candidate], v)).length : 0
          // continuous sun and dark cannot outlast the mission, so their sliders stop there (or at the current value, if beyond)
          const dur = Number(constraints.mission_duration_days)
          const cap = c === 'min_continuous_sun_days' ? dur : c === 'max_continuous_dark_hours' ? dur * 24 : Infinity
          const top = def ? Math.max(Math.min(def.max!, cap), v) : v
          return (
            <div key={c} className="filter-criterion">
              <label className="filter-check">
                <input type="checkbox" checked={f.allPass || f.mustPass.includes(c)} disabled={f.allPass}
                  onChange={() => onChange({ ...f, mustPass: toggle(f.mustPass, c), thresholds: Object.fromEntries(Object.entries(f.thresholds).filter(([k]) => k !== c)) })} />{criterion(c)}
              </label>
              {on && s && def && (
                <div className="filter-slider indent" data-testid={`threshold-${c}`}>
                  <span className="filter-slider-value">
                    {thresholdText(c, v)}
                    {v !== Number(constraints[c]) && <span className="note"> · search used {fmt(Number(constraints[c]))}</span>}
                  </span>
                  <input type="range" min={def.min!} max={top} step={s.step} value={v} aria-label={`${criterion(c)} threshold`}
                    aria-valuetext={`${fmt(v)} ${s.unit}`}
                    onChange={(e) => onChange({ ...f, thresholds: { ...f.thresholds, [c]: Number(e.target.value) } })} />
                  <span className="note">{kept} of {rows.length} meet it</span>
                </div>
              )}
            </div>
          )
        })}
        <div className="recompute">
          <button type="button" aria-pressed={rankedOn !== null} disabled={busy || (rankedOn === null && !canFocus && !tuned)} data-testid="recompute" aria-describedby={`${id}-recompute-note`}
            onClick={() => (rankedOn === null ? onRecompute(only, overrides) : onRecompute(null, {}))}>
            <RefreshCw size={13} aria-hidden="true" />{rankedOn !== null ? 'Recomputed · undo' : !tuned ? 'Recompute for ticked' : canFocus ? 'Recompute ticked with these values' : 'Recompute with these values'}
          </button>
          {changed && <button type="button" className="quiet" disabled={busy} onClick={() => onRecompute(canFocus ? ticked : rankedOn, overrides)}>Update</button>}
          <span className="note" id={`${id}-recompute-note`}>
            {rankedOn !== null ? 'Ranked on the ticked criteria only.'
              : canFocus ? 'Rerun the search ranking on the ticked criteria only.'
                : tuned ? 'Rerun the search with the slider values.'
                  : 'Tick criteria to filter this list with sliders, or to rank on them alone.'}
            {tuned && ` Sets the Constraints panel to ${tunedText}.`}
          </span>
        </div>
      </fieldset>
      <div className="results-filter-foot">
        <button type="button" className="quiet" onClick={() => onChange({ ...NO_FILTER, sort: f.sort })}>Reset</button>
        <button type="button" onClick={onClose}>Done</button>
      </div>
    </div>
  )
}
