import { Globe, Minimize2, Pin, PinOff } from 'lucide-react'
import type { RefObject } from 'react'
import Chips from './Chips'
import type { Constraints } from './engine/engine'
import type { Candidate, FinderResult } from './engine/finder'
import { diffParts } from './engine/finder'

interface Props {
  finder: FinderResult
  candidates: Candidate[]
  opened: number | null
  date: (hour: number) => string
  onOpen: (i: number | null) => void
  onMoon: (i: number) => void // show the result on the Moon view, down on its site's grid
  stale: boolean // constraints changed after this search
  busy: boolean
  onRerun: () => void
  headingRef: RefObject<HTMLHeadingElement | null> // focused when a search finishes
  constraints: Constraints // the values this search ran with (they may have changed since)
  pinned: Set<string> // keys (point@hour) already in the compare tray
  onPin: (i: number) => void // toggles the result in the compare tray
  onMinimize: () => void // folds the panel into its top-right corner
  fresh: boolean // just searched: play the entrance
}

export default function Results({ finder, candidates, opened, date, onOpen, onMoon, stale, busy, onRerun, headingRef, constraints, pinned, onPin, onMinimize, fresh }: Props) {
  const passing = finder.results.filter((r) => r.evaluation.fails === 0).length
  return (
    <section className={fresh ? 'results-panel fresh' : 'results-panel'} aria-labelledby="results-heading">
      <div className="results-head">
        <h2 id="results-heading" ref={headingRef} tabIndex={-1}>Alternatives</h2>
        <button type="button" className="icon-button" onClick={onMinimize} aria-label="Minimize the alternatives" title="Minimize">
          <Minimize2 size={15} aria-hidden="true" />
        </button>
      </div>
      {stale && (
        <p className="stale" data-testid="results-stale">
          Out of date: the constraints changed after this search, so the pass/fail marks below no longer apply.{' '}
          <button type="button" onClick={onRerun} disabled={busy}>{busy ? 'Searching…' : 'Run again'}</button>
        </p>
      )}
      <p className="note" data-testid="finder-summary">
        {finder.evaluated.toLocaleString('en-US')} site and date pairs across {candidates.length} points in{' '}
        <span data-testid="finder-ms">{finder.ms.toFixed(0)}</span> ms · {passing} of the top {finder.results.length} meet every constraint
      </p>
      <ol className={stale ? 'results is-stale' : 'results'}>
        {finder.results.map((r, i) => {
          const c = candidates[r.candidate]
          const d = diffParts(candidates[0], finder.baseline, c, r)
          const title = `#${i + 1} · ${d.where} · ${d.shift}`
          // the visible text stays "Open in 3D"; the name adds which result, so a screen reader can tell ten buttons apart
          const which = `#${i + 1}, ${d.where}, ${d.shift}, ${c.label}, ${date(r.start)} UTC`
          return (
            <li key={`${c.id}@${r.start}`} className={opened === i ? 'open' : ''} data-testid="result">
              <div className="result-head">
                <div className="result-title">
                  <strong data-testid="result-title">{title}</strong>
                  <span>{c.label} · lands <span className="nowrap">{date(r.start)} UTC</span></span>
                </div>
                <div className="result-actions">
                  <button type="button" className="icon-button" aria-label={`${pinned.has(`${c.id}@${r.start}`) ? 'Unpin' : 'Pin'} #${i + 1} ${pinned.has(`${c.id}@${r.start}`) ? 'from' : 'to'} the compare tray`}
                    aria-pressed={pinned.has(`${c.id}@${r.start}`)} onClick={() => onPin(i)}>
                    {pinned.has(`${c.id}@${r.start}`) ? <PinOff size={15} aria-hidden="true" /> : <Pin size={15} aria-hidden="true" />}
                  </button>
                  <button type="button" className="icon-button" aria-label={`Show on the Moon: ${which}`} title="Show on the Moon" onClick={() => onMoon(i)}>
                    <Globe size={15} aria-hidden="true" />
                  </button>
                  <button type="button" aria-label={`${opened === i ? 'Back to plan from' : 'Open in 3D:'} ${which}`}
                    aria-pressed={opened === i} onClick={() => onOpen(opened === i ? null : i)}>
                    {opened === i ? 'Back to plan' : 'Open in 3D'}
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
            </li>
          )
        })}
      </ol>
    </section>
  )
}
