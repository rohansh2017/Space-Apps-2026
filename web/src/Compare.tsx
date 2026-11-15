import Chips from './Chips'
import type { Angles, Constraints, Evaluation, Metrics } from './engine/engine'
import Panorama from './Panorama'
import Summary from './Summary'

export interface Side {
  title: string // "Plan: Shackleton rim" or "Alternative #1 · 5.0 km S · +16 days"
  detail: string // the site and landing time
  day: { mask: Uint16Array | null; track: Angles[]; metrics: Metrics | null; evaluation: Evaluation | null }
}

/** F11: the original plan and the opened alternative as paired panoramas and metrics, scrubbed together. */
export default function Compare({ plan, alt, t, constraints }: { plan: Side; alt: Side; t: number; constraints: Constraints }) {
  return (
    <section className="panel" aria-label="Side-by-side comparison" data-testid="compare">
      <h2>Side by side</h2>
      <div className="compare-grid">
        {[plan, alt].map((s, i) => (
          <div key={i} data-testid={i ? 'compare-alt' : 'compare-plan'}>
            <div className="status">
              <strong>{s.title}</strong>
              <span>{s.detail}</span>
              {s.day.evaluation && <Chips evaluation={s.day.evaluation} constraints={constraints} />}
            </div>
            {s.day.metrics && <Summary metrics={s.day.metrics} />}
            <Panorama mask={s.day.mask} track={s.day.track} t={Math.min(t, s.day.track.length - 1)} />
          </div>
        ))}
      </div>
    </section>
  )
}
