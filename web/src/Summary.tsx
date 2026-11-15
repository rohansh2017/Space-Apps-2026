import { useContext } from 'react'
import type { Metrics } from './engine/engine'
import { Term } from './Glossary'
import { Guide } from './guide'

interface Props {
  metrics: Metrics
  previous?: Metrics | null // F14: when set, each tile shows how it changed since the last nudge
  testId?: string // only the plan's column carries the test id, so tests find one
  best?: Set<string> // compare tray: metrics where this column is the best of the tray
}

/** Mission-window metrics: exact numbers in Planner mode, plain-English labels in Explorer mode. */
export default function Summary({ metrics, previous = null, testId, best }: Props) {
  // weight, not colour, marks the best value in a row; the words say it for screen readers
  const mark = (k: string) => (best?.has(k) ? { className: 'best' } : {})
  const tag = (k: string) => best?.has(k) && <span className="sr-only"> (best in the tray)</span>
  const explorer = useContext(Guide).mode === 'explorer'
  const delta = (k: 'sunlitPct' | 'longestLitH' | 'longestDarkH' | 'earthPct' | 'powerIndex' | 'meanElLit', digits: number, unit = '') => {
    const [now, before] = [metrics[k], previous?.[k]]
    if (now === null || before === null || before === undefined) return null
    const d = now - before
    if (Math.abs(d) < 0.5 * 10 ** -digits) return null
    // the key changes with the value, so the fade-in animation replays on every nudge
    return <em key={`${k}:${d}`} className="delta" data-testid="delta">{d > 0 ? '+' : '−'}{Math.abs(d).toFixed(digits)}{unit}</em>
  }
  if (explorer)
    return (
      <ul className="summary words" data-testid={testId}>
        <li {...mark('sunlitPct')}><Term id="Sunlit %">Sunny {metrics.sunlitPct.toFixed(0)}% of the mission</Term>{delta('sunlitPct', 0, '%')}</li>
        <li {...mark('longestDarkH')}><Term id="Longest dark run">{metrics.longestDarkH ? `Must survive ${metrics.longestDarkH} h of darkness` : 'Never fully dark'}</Term>{delta('longestDarkH', 0, ' h')}</li>
        <li {...mark('earthPct')}><Term id="Earth link">Can call home {metrics.earthPct.toFixed(0)}% of the time</Term>{delta('earthPct', 0, '%')}</li>
        <li>
          <Term id="Power index">Power</Term>{' '}
          <span className="battery" role="img" aria-label={`Power index ${metrics.powerIndex.toFixed(2)}`}>
            <i style={{ width: `${Math.round(metrics.powerIndex * 100)}%` }} />
          </span>
          {delta('powerIndex', 2)}
        </li>
      </ul>
    )
  return (
    <dl className="summary" data-testid={testId}>
      <div><dt>Sunlit</dt><dd {...mark('sunlitPct')}>{metrics.sunlitPct.toFixed(1)}%{tag('sunlitPct')}{delta('sunlitPct', 1, '%')}</dd></div>
      <div><dt>Longest lit</dt><dd {...mark('longestLitH')}>{metrics.longestLitH} h{tag('longestLitH')}{delta('longestLitH', 0, ' h')}</dd></div>
      <div><dt>Longest dark</dt><dd {...mark('longestDarkH')}>{metrics.longestDarkH} h{tag('longestDarkH')}{delta('longestDarkH', 0, ' h')}</dd></div>
      <div><dt>Earth visible</dt><dd {...mark('earthPct')}>{metrics.earthPct.toFixed(1)}%{tag('earthPct')}{delta('earthPct', 1, '%')}</dd></div>
      <div><dt>Power index</dt><dd {...mark('powerIndex')}>{metrics.powerIndex.toFixed(2)}{tag('powerIndex')}{delta('powerIndex', 2)}</dd></div>
      <div><dt>Mean elevation while lit</dt><dd {...mark('meanElLit')}>{metrics.meanElLit === null ? 'n/a' : `${metrics.meanElLit.toFixed(2)}°`}{tag('meanElLit')}{delta('meanElLit', 2, '°')}</dd></div>
    </dl>
  )
}
