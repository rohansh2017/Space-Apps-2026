import { ArrowUpDown, Globe, ListFilter, Minimize2, Pin, PinOff, RefreshCw } from 'lucide-react'
import type { RefObject } from 'react'
import { useMemo, useState } from 'react'
import Chips from './Chips'
import type { Constraints } from './engine/engine'
import type { Candidate, FinderResult, Scored } from './engine/finder'
import { CRITERIA, diffParts, relaxations } from './engine/finder'
import ResultFilters, { FilterPills } from './ResultFilters'
import type { ResultFilter } from './resultFilter'
import { activeCount, applyFilter, criterion, listOf, rowsOf } from './resultFilter'
import WhyNotLine from './WhyNotLine'
import { whyNotFacts } from './whynot'

interface Props {
  finder: FinderResult
  candidates: Candidate[]
  opened: string | null // key (point@hour) of the result in the 3D view
  date: (hour: number) => string
  onOpen: (r: Scored | null) => void
  onMoon: (r: Scored) => void // show the result on the Moon view, down on its site's grid
  stale: boolean // constraints changed after this search
  busy: boolean
  onRerun: () => void
  onRecompute: (only: string[] | null) => void // F31: rank on these constraints alone, or (null) on all of them again
  headingRef: RefObject<HTMLHeadingElement | null> // focused when a search finishes
  constraints: Constraints // the values this search ran with (they may have changed since)
  pinned: Set<string> // keys (point@hour) already in the compare tray
  onPin: (r: Scored) => void // toggles the result in the compare tray
  onMinimize: () => void // folds the panel into its top-right corner
  fresh: boolean // just searched: play the entrance
  lead?: string // F26: the copilot's answer, when the copilot ran this search
  filter: ResultFilter // F30: view filters over the ranked pool (kept in App so they survive minimizing)
  onFilter: (f: ResultFilter) => void
  onAnnounce: (text: string) => void // the app's one polite live region
}

export default function Results({ finder, candidates, opened, date, onOpen, onMoon, stale, busy, onRerun, onRecompute, headingRef, constraints, pinned, onPin, onMinimize, fresh, lead = '', filter, onFilter, onAnnounce }: Props) {
  const passing = finder.results.filter((r) => r.evaluation.fails === 0).length
  const base = finder.baseline
  const [filtersOpen, setFiltersOpen] = useState(false)
  const rows = useMemo(() => rowsOf(finder.pool, candidates, finder.baseline), [finder, candidates])
  const sites = useMemo(() => [...new Set(rows.map((x) => candidates[x.r.candidate].label))].sort(), [rows, candidates])
  const { shown, matches } = applyFilter(rows, candidates, filter)
  const active = activeCount(filter)
  const change = (f: ResultFilter) => {
    onFilter(f)
    const n = applyFilter(rows, candidates, f).matches
    onAnnounce(`${n} alternative${n === 1 ? '' : 's'} match${n === 1 ? 'es' : ''} the filters.`)
  }
  const criteria = CRITERIA.filter((k) => k !== 'landing_sun_and_earth_visible' || constraints.landing_sun_and_earth_visible)
  const only = finder.only
  const keyOf = (r: Scored) => `${candidates[r.candidate].id}@${r.start}`
  // F27: the plan's own fix, including the earliest later landing at the same point (the engine walked it hourly)
  const planWhy = base.evaluation.fails
    ? whyNotFacts(relaxations(base.metrics, candidates[0].slopeDeg, constraints, base.evaluation),
      finder.planPassStart === null ? null : finder.planPassStart - base.start)
    : null
  return (
    <section className={fresh ? 'results-panel fresh' : 'results-panel'} aria-labelledby="results-heading">
      <div className="results-head">
        <h2 id="results-heading" ref={headingRef} tabIndex={-1}>Alternatives</h2>
        <div className="results-head-actions">
          <button type="button" className="icon-button filter-toggle" aria-expanded={filtersOpen} aria-controls="results-filter"
            aria-label={`Filters${active ? `, ${active} active` : ''}`} title={filtersOpen ? 'Hide filters' : 'Filter'} data-testid="filter-toggle"
            onClick={() => setFiltersOpen(!filtersOpen)}>
            <ListFilter size={15} aria-hidden="true" />
            {active > 0 && <span className="filter-badge" aria-hidden="true">{active}</span>}
          </button>
          <button type="button" className="icon-button" onClick={onMinimize} aria-label="Minimize the alternatives" title="Minimize">
            <Minimize2 size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
      {filtersOpen && (
        <ResultFilters id="results-filter" filter={filter} onChange={change} onClose={() => setFiltersOpen(false)} sites={sites}
          criteria={criteria} maxDays={Number(constraints.slip_range_days)} rankedOn={only} busy={busy} onRecompute={onRecompute} />
      )}
      {stale && (
        <p className="stale" data-testid="results-stale">
          Out of date: the constraints changed after this search, so the pass/fail marks below no longer apply.{' '}
          <button type="button" onClick={onRerun} disabled={busy}>{busy ? 'Searching…' : 'Run again'}</button>
        </p>
      )}
      {lead && <p className="copilot-lead" data-testid="copilot-summary">{lead} <span className="note">Copilot answer from the engine's results.</span></p>}
      {planWhy && !stale && <WhyNotLine facts={planWhy} ask testId="plan-whynot" />}
      <p className="note" data-testid="finder-summary">
        {finder.evaluated.toLocaleString('en-US')} site and date pairs across {candidates.length} points in{' '}
        <span data-testid="finder-ms">{finder.ms.toFixed(0)}</span> ms · {passing} of the top {finder.results.length} meet {only ? 'the chosen criteria' : 'every constraint'}
      </p>
      {only && (
        <p className="focus-note" data-testid="focus-note">
          <RefreshCw size={13} aria-hidden="true" />
          <span>Ranked on {listOf(criteria.filter((k) => only.includes(k)).map(criterion))} only; the other criteria are ignored.</span>
          <button type="button" className="link-button" disabled={busy} onClick={() => onRecompute(null)}>Use every criterion</button>
        </p>
      )}
      <div className="results-toolbar">
        <span className="note" data-testid="filter-count">
          {active ? `${matches} of ${rows.length} match${matches > shown.length ? ` · top ${shown.length} shown` : ''}` : `Top ${shown.length} of ${rows.length}`}
        </span>
        <label className="results-sort">
          <ArrowUpDown size={13} aria-hidden="true" />
          <span className="sr-only">Sort alternatives by</span>
          <select value={filter.sort} data-testid="results-sort" onChange={(e) => change({ ...filter, sort: e.target.value as ResultFilter['sort'] })}>
            <option value="margin">Best margin</option>
            <option value="soonest">Soonest landing</option>
          </select>
        </label>
      </div>
      <FilterPills filter={filter} onChange={change} />
      {!shown.length && (
        <p className="stale" data-testid="filter-empty">
          No alternatives match these filters.{' '}
          <button type="button" onClick={() => change({ ...filter, minDays: null, maxDays: null, maxKm: null, sites: [], allPass: false, mustPass: [] })}>Clear filters</button>
        </p>
      )}
      <ol className={stale ? 'results is-stale' : 'results'}>
        {shown.map(({ r, rank }) => {
          const c = candidates[r.candidate]
          const d = diffParts(candidates[0], finder.baseline, c, r)
          const title = `#${rank} · ${d.where} · ${d.shift}`
          // the visible text stays "Open in 3D"; the name adds which result, so a screen reader can tell ten buttons apart
          const which = `#${rank}, ${d.where}, ${d.shift}, ${c.label}, ${date(r.start)} UTC`
          const key = keyOf(r)
          const isOpen = opened === key
          const isPinned = pinned.has(key)
          return (
            <li key={key} className={isOpen ? 'open' : ''} data-testid="result">
              <div className="result-head">
                <div className="result-title">
                  <strong data-testid="result-title">{title}</strong>
                  <span>{c.label} · lands <span className="nowrap">{date(r.start)} UTC</span></span>
                </div>
                <div className="result-actions">
                  <button type="button" className="icon-button" aria-label={`${isPinned ? 'Unpin' : 'Pin'} #${rank} ${isPinned ? 'from' : 'to'} the compare tray`}
                    aria-pressed={isPinned} onClick={() => onPin(r)}>
                    {isPinned ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
                  </button>
                  <button type="button" className="icon-button" aria-label={`Show on the Moon: ${which}`} title="Show on the Moon" onClick={() => onMoon(r)}>
                    <Globe size={15} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`${isOpen ? 'Back to plan from' : 'Open in 3D:'} ${which}`}
                    aria-pressed={isOpen} onClick={() => onOpen(isOpen ? null : r)}>
                    {isOpen ? 'Back to plan' : 'Open in 3D'}
                  </button>
                </div>
              </div>
              <div data-testid="result-diff">{d.metrics} <span className="note nowrap">vs the plan</span></div>
              <div className="result-foot">
                <Chips evaluation={r.evaluation} constraints={constraints} />
                <span className="note">
                  sun {r.metrics.sunlitPct.toFixed(0)}% · longest dark {r.metrics.longestDarkH} h · Earth {r.metrics.earthPct.toFixed(0)}% · slope {c.slopeDeg}°
                </span>
              </div>
              {r.evaluation.fails > 0 && !stale && (
                <WhyNotLine facts={whyNotFacts(relaxations(r.metrics, c.slopeDeg, constraints, r.evaluation), null)} testId="result-whynot" />
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
