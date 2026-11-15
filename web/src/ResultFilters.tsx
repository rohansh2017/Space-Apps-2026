// F30: the Alternatives panel's filter menu (hidden by default) and the removable pills for active filters.
import { RefreshCw, X } from 'lucide-react'
import type { ResultFilter } from './resultFilter'
import { NO_FILTER, criterion, pillsOf, sameSet } from './resultFilter'

const num = (v: string): number | null => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : Math.max(0, Number(v)))

/** Active filters as removable pills, shown whether or not the menu is open. */
export function FilterPills({ filter, onChange }: { filter: ResultFilter; onChange: (f: ResultFilter) => void }) {
  const pills = pillsOf(filter)
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
  onRecompute: (only: string[] | null) => void
}

const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

export default function ResultFilters({ id, filter: f, onChange, onClose, sites, criteria, maxDays, rankedOn, busy, onRecompute }: Props) {
  // F31: recompute ranks on the ticked criteria alone; pressed again, it goes back to every criterion
  const ticked = f.allPass ? [] : f.mustPass
  const canFocus = ticked.length > 0 && ticked.length < criteria.length
  const changed = rankedOn !== null && canFocus && !sameSet(ticked, rankedOn)
  return (
    <div id={id} className="results-filter" role="group" aria-label="Filter the alternatives" data-testid="results-filter">
      <div className="results-filter-head">
        <span>Filters</span>
        <button type="button" className="icon-button" aria-label="Hide filters" title="Hide filters" onClick={onClose}>
          <X size={15} aria-hidden="true" />
        </button>
      </div>
      <fieldset>
        <legend>Days out</legend>
        <div className="filter-range">
          <input type="number" inputMode="numeric" min={0} max={maxDays} step={1} aria-label="Minimum days out" placeholder="0"
            value={f.minDays ?? ''} onChange={(e) => onChange({ ...f, minDays: num(e.target.value) })} />
          <span aria-hidden="true">to</span>
          <input type="number" inputMode="numeric" min={0} max={maxDays} step={1} aria-label="Maximum days out" placeholder={String(maxDays)}
            value={f.maxDays ?? ''} onChange={(e) => onChange({ ...f, maxDays: num(e.target.value) })} />
          <span className="note">days</span>
        </div>
      </fieldset>
      <fieldset>
        <legend>Distance from plan</legend>
        <div className="filter-range">
          <span aria-hidden="true">Within</span>
          <input type="number" inputMode="decimal" min={0} step={0.5} aria-label="Maximum distance from the plan in km" placeholder="any"
            value={f.maxKm ?? ''} onChange={(e) => onChange({ ...f, maxKm: num(e.target.value) })} />
          <span className="note">km</span>
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
        {criteria.map((c) => (
          <label key={c} className="filter-check">
            <input type="checkbox" checked={f.allPass || f.mustPass.includes(c)} disabled={f.allPass}
              onChange={() => onChange({ ...f, mustPass: toggle(f.mustPass, c) })} />{criterion(c)}
          </label>
        ))}
        <div className="recompute">
          <button type="button" aria-pressed={rankedOn !== null} disabled={busy || (rankedOn === null && !canFocus)} data-testid="recompute" aria-describedby={`${id}-recompute-note`}
            onClick={() => onRecompute(rankedOn === null ? ticked : null)}>
            <RefreshCw size={13} aria-hidden="true" />{rankedOn === null ? 'Recompute for ticked' : 'Recomputed · undo'}
          </button>
          {changed && <button type="button" className="quiet" disabled={busy} onClick={() => onRecompute(ticked)}>Update</button>}
          <span className="note" id={`${id}-recompute-note`}>
            {rankedOn !== null ? 'Ranked on the ticked criteria only.' : canFocus ? 'Rerun the search ranking on the ticked criteria only.' : 'Tick one or more criteria (not all) to rank on them alone.'}
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
