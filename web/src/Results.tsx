import Chips from './Chips'
import type { Candidate, FinderResult } from './engine/finder'
import { diffText } from './engine/finder'

interface Props {
  finder: FinderResult
  candidates: Candidate[]
  opened: number | null
  date: (hour: number) => string
  onOpen: (i: number | null) => void
}

export default function Results({ finder, candidates, opened, date, onOpen }: Props) {
  const passing = finder.results.filter((r) => r.evaluation.fails === 0).length
  return (
    <section className="panel" aria-label="Finder results">
      <h2>Alternatives</h2>
      <p className="note" data-testid="finder-summary">
        {finder.evaluated.toLocaleString('en-US')} site and date pairs across {candidates.length} points in{' '}
        <span data-testid="finder-ms">{finder.ms.toFixed(0)}</span> ms · {passing} of the top {finder.results.length} meet every constraint
      </p>
      <ol className="results">
        {finder.results.map((r, i) => {
          const c = candidates[r.candidate]
          return (
            <li key={`${c.id}@${r.start}`} className={opened === i ? 'open' : ''} data-testid="result">
              <div className="result-head">
                <strong>{c.label}</strong>
                <span>{date(r.start)} UTC</span>
                <button type="button" onClick={() => onOpen(opened === i ? null : i)}>
                  {opened === i ? 'Back to plan' : 'Open in 3D'}
                </button>
              </div>
              <div data-testid="result-diff">{diffText(candidates[0], finder.baseline, c, r)}</div>
              <div className="result-foot">
                <Chips evaluation={r.evaluation} />
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
