import { Crosshair, Eye, Globe, Pin, PinOff, Target, X } from 'lucide-react'
import { useContext } from 'react'
import Chips from './Chips'
import type { Angles, Constraints, Evaluation, Metrics } from './engine/engine'
import { Guide } from './guide'
import Panorama from './Panorama'
import Summary from './Summary'

export interface TrayColumn {
  key: string // 'plan' for the live plan, else the pin's "region:index@hour"
  title: string // "Plan" or "5.0 km S · +16 days"
  detail: string // site
  when: string // landing time, kept on one line
  viewing: boolean // this scenario is the one on the stage (the 3D view or the Moon view)
  letter?: string // pinned columns: the letter that marks this scenario on the Moon view
  day: { mask: Uint16Array | null; track: Angles[]; metrics: Metrics | null; evaluation: Evaluation | null } | null // null while its terrain loads
}

interface Props {
  plan: TrayColumn | null // the live plan, when the user has added it to the tray
  pinned: TrayColumn[]
  baseline: string | null // the column the others are compared to; null = the first column
  t: number // scrubber hour, shared by every column
  constraints: Constraints
  previous: Metrics | null // F14 nudge deltas, on the plan's column while it is the baseline
  pending: { title: string } | null // a pin waiting for a free column
  stage: 'moon' | 'ground' // which view the stage shows
  onView: (key: string | null) => void // null = the plan
  onMoon: (key: string | null) => void // show this scenario's point on the Moon view
  onUnpin: (key: string) => void
  onAdopt: (key: string) => void // make this pin the plan; the old plan takes its column
  onSetBaseline: (key: string) => void
  onRemovePlan: () => void
  onReplace: (key: string) => void
  onCancelPending: () => void
  onPinView: () => void
  canPinView: boolean
}

export const TRAY_MAX = 4 // columns in the tray, the live plan included when it is there

// which way is better for each metric, to mark the best value in each tray row
type Key = 'sunlitPct' | 'longestLitH' | 'longestDarkH' | 'earthPct' | 'powerIndex' | 'meanElLit'
const BETTER: Record<Key, 1 | -1> = { sunlitPct: 1, longestLitH: 1, longestDarkH: -1, earthPct: 1, powerIndex: 1, meanElLit: 1 }

/** The compare tray: up to four scenarios (Pin this view adds the live plan when it is in view), drawn the same way, scrubbed together, compared to one baseline. */
export default function Tray({ plan, pinned, baseline, t, constraints, previous, pending, stage, onView, onMoon, onUnpin, onAdopt, onSetBaseline, onRemovePlan,
  onReplace, onCancelPending, onPinView, canPinView }: Props) {
  const explorer = useContext(Guide).mode === 'explorer'
  const columns = [...(plan ? [plan] : []), ...pinned]
  const base = columns.find((c) => c.key === baseline) ?? columns[0]
  const scored = columns.filter((c) => c.day?.metrics)
  const bestOf = (c: TrayColumn): Set<string> => {
    const out = new Set<string>()
    if (scored.length < 2 || !c.day?.metrics) return out
    for (const k of Object.keys(BETTER) as Key[]) {
      const vals = scored.map((s) => s.day!.metrics![k])
      if (vals.some((v) => v === null) || new Set(vals.map((v) => v!.toFixed(2))).size < 2) continue // a tie everywhere marks nothing
      const top = BETTER[k] > 0 ? Math.max(...(vals as number[])) : Math.min(...(vals as number[]))
      if (Math.abs((c.day.metrics[k] ?? NaN) - top) < 0.005) out.add(k)
    }
    return out
  }
  const column = (c: TrayColumn) => {
    const isPlan = c.key === 'plan'
    const isBase = c === base
    return (
      <article key={c.key} className={`tray-col${isBase ? ' base' : ' compared'}${c.viewing ? ' viewing' : ''}`}
        aria-label={`${c.title}, ${c.detail}, ${c.when}${isBase && columns.length > 1 ? ', the baseline' : ''}`}
        aria-current={c.viewing ? 'true' : undefined} data-testid={isPlan ? 'tray-plan' : 'tray-pin'}>
        <header>
          <div className="tray-col-title">
            <strong>{c.letter && <span className="tray-letter" title="Its letter on the Moon view">{c.letter}</span>}{c.title}</strong>
            <button type="button" className="icon-button" onClick={() => (isPlan ? onRemovePlan() : onUnpin(c.key))}
              aria-label={isPlan ? 'Remove the plan from the tray' : `Unpin ${c.title}`} title={isPlan ? 'Remove from the tray' : 'Unpin'}>
              {isPlan ? <X size={14} aria-hidden="true" /> : <PinOff size={14} aria-hidden="true" />}
            </button>
          </div>
          <span><span className="site">{c.detail} ·</span><span className="nowrap">{c.when}</span></span>
          {columns.length > 1 && (isBase
            ? <span className="baseline-tag" data-testid="baseline">Baseline</span>
            : (
              <button type="button" className="baseline-set" onClick={() => onSetBaseline(c.key)} aria-label={`Compare the others to ${c.title}`}>
                <Crosshair size={12} aria-hidden="true" />Compare to this
              </button>
            ))}
        </header>
        {/* always ten rows (head, chips, six metrics, skyline, actions) shared with the label column, so values line up across */}
        <div className="tray-row">
          {c.day === null ? <p className="note">Loading terrain…</p>
            : c.day.evaluation ? <Chips evaluation={c.day.evaluation} constraints={constraints} failedOnly /> : <p className="note">Mission window runs past 2035</p>}
        </div>
        {c.day?.metrics
          ? <Summary metrics={c.day.metrics} previous={isBase ? (isPlan ? previous : null) : base.day?.metrics ?? null}
            testId={isPlan ? 'summary' : undefined} best={bestOf(c)} />
          : <div className="tray-metrics-empty" />}
        <div className="tray-row">
          {c.day && <Panorama mask={c.day.mask} track={c.day.track} t={Math.min(t, c.day.track.length - 1)} width={540} height={100} compact
            label={`Skyline for ${c.title}: Sun track in gold, Earth in blue`} />}
        </div>
        <footer>
          {!(c.viewing && stage === 'ground') && (
            <button type="button" className="quiet" onClick={() => onView(isPlan ? null : c.key)} aria-label={`View ${isPlan ? 'the plan' : c.title} in 3D`}>
              <Eye size={14} aria-hidden="true" /> View in 3D
            </button>
          )}
          {!(c.viewing && stage === 'moon') && c.day && (
            <button type="button" className="quiet" onClick={() => onMoon(isPlan ? null : c.key)} aria-label={`Show ${isPlan ? 'the plan' : c.title} on the Moon`}>
              <Globe size={14} aria-hidden="true" /> Show on the Moon
            </button>
          )}
          {c.viewing && <span className="note">{stage === 'moon' ? 'On the Moon view' : 'In the 3D view'}</span>}
          {!isPlan && c.day && (
            <button type="button" className="quiet" onClick={() => onAdopt(c.key)} aria-label={`Make ${c.title} the plan`}>
              <Target size={14} aria-hidden="true" /> Make this the plan
            </button>
          )}
        </footer>
      </article>
    )
  }
  return (
    <section className="tray" aria-label="Compare scenarios" data-testid="tray">
      <header className="tray-head">
        <h2>Compare</h2>
        <span className="note">{columns.length} of {TRAY_MAX}{columns.length > 1 ? ' · scrubbed together' : ''}</span>
        <button type="button" className="quiet" onClick={onPinView} disabled={!canPinView}>
          <Pin size={14} aria-hidden="true" /> Pin this view
        </button>
      </header>
      {pending && (
        <div className="tray-full" role="alert">
          <span>The tray holds {TRAY_MAX}. Replace which one with {pending.title}?</span>
          {pinned.map((p) => (
            <button key={p.key} type="button" onClick={() => onReplace(p.key)}>Replace {p.title}</button>
          ))}
          <button type="button" className="quiet" onClick={onCancelPending}>Keep the tray as it is</button>
        </div>
      )}
      {/* the row labels stay even when nothing is pinned yet, so the table's shape is always visible */}
      <div className="tray-cols" style={{ gridTemplateColumns: `max-content repeat(${Math.max(2, columns.length)}, minmax(0, 1fr))` }}>
          <div className="tray-labels" aria-hidden="true">
            <span />
            <span>Constraints</span>
            {explorer ? <span className="span6" /> : ['Sunlit', 'Longest lit', 'Longest dark', 'Earth visible', 'Power index', 'Mean elevation while lit'].map((l) => <span key={l}>{l}</span>)}
            <span>Skyline</span>
            <span />
          </div>
          {columns.map(column)}
      </div>
    </section>
  )
}
