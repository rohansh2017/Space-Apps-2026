import { useContext } from 'react'
import type { Metrics } from './engine/engine'
import { Term } from './Glossary'
import { Guide } from './guide'

/** Mission-window metrics: exact numbers in Planner mode, plain-English labels in Explorer mode. */
export default function Summary({ metrics }: { metrics: Metrics }) {
  const explorer = useContext(Guide).mode === 'explorer'
  if (explorer)
    return (
      <ul className="summary words" data-testid="summary">
        <li><Term id="Sunlit %">Sunny {metrics.sunlitPct.toFixed(0)}% of the mission</Term></li>
        <li><Term id="Longest dark run">{metrics.longestDarkH ? `Must survive ${metrics.longestDarkH} h of darkness` : 'Never fully dark'}</Term></li>
        <li><Term id="Earth link">Can call home {metrics.earthPct.toFixed(0)}% of the time</Term></li>
        <li>
          <Term id="Power index">Power</Term>{' '}
          <span className="battery" role="img" aria-label={`Power index ${metrics.powerIndex.toFixed(2)}`}>
            <i style={{ width: `${Math.round(metrics.powerIndex * 100)}%` }} />
          </span>
        </li>
      </ul>
    )
  return (
    <dl className="summary" data-testid="summary">
      <div><dt>Sunlit</dt><dd>{metrics.sunlitPct.toFixed(1)}%</dd></div>
      <div><dt>Longest lit</dt><dd>{metrics.longestLitH} h</dd></div>
      <div><dt>Longest dark</dt><dd>{metrics.longestDarkH} h</dd></div>
      <div><dt>Earth visible</dt><dd>{metrics.earthPct.toFixed(1)}%</dd></div>
      <div><dt>Power index</dt><dd>{metrics.powerIndex.toFixed(2)}</dd></div>
      <div><dt>Mean elevation while lit</dt><dd>{metrics.meanElLit === null ? 'n/a' : `${metrics.meanElLit.toFixed(2)}°`}</dd></div>
    </dl>
  )
}
