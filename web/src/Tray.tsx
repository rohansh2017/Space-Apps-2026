import { Eye, Pin, PinOff, Target } from 'lucide-react'
import { useContext } from 'react'
import Chips from './Chips'
import type { Angles, Constraints, Evaluation, Metrics } from './engine/engine'
import { Guide } from './guide'
import Panorama from './Panorama'
import Summary from './Summary'

export interface TrayColumn {
  key: string
  title: string // "Plan" or "5.0 km S · +16 days"
  detail: string // site
  when: string // landing time, kept on one line
  viewing: boolean // this scenario is the one in the 3D view
  day: { mask: Uint16Array | null; track: Angles[]; metrics: Metrics | null; evaluation: Evaluation | null } | null // null while its terrain loads
}

interface Props {
  plan: TrayColumn
  pinned: TrayColumn[]
  t: number // scrubber hour, shared by every column
  constraints: Constraints
  previous: Metrics | null // F14 nudge deltas on the plan's column; pinned columns show theirs against the plan
  pending: { title: string } | null // a pin waiting for a free column
  onView: (key: string | null) => void // null = the plan
  onUnpin: (key: string) => void
  onAdopt: (key: string) => void // make this pin the plan; the old plan takes its column
  onReplace: (key: string) => void
  onCancelPending: () => void
  onPinView: () => void
  canPinView: boolean
}

export const TRAY_MAX = 3 // pinned scenarios beside the plan

/** The compare tray: the plan plus up to three pinned scenarios, each drawn the same way and scrubbed together. */
// which way is better for each metric, to mark the best value in each tray row
type Key = 'sunlitPct' | 'longestLitH' | 'longestDarkH' | 'earthPct' | 'powerIndex' | 'meanElLit'
const BETTER: Record<Key, 1 | -1> = { sunlitPct: 1, longestLitH: 1, longestDarkH: -1, earthPct: 1, powerIndex: 1, meanElLit: 1 }

export default function Tray({ plan, pinned, t, constraints, previous, pending, onView, onUnpin, onAdopt, onReplace, onCancelPending, onPinView, canPinView }: Props) {
  const explorer = useContext(Guide).mode === 'explorer'
  const scored = [plan, ...pinned].filter((c) => c.day?.metrics)
  const bestOf = (c: TrayColumn): Set<string> => {
    const out = new Set<string>()
    if (scored.length < 2 || !c.day?.metrics) return out
    for (const k of Object.keys(BETTER) as Key[]) {
      const dir = BETTER[k]
      const vals = scored.map((s) => s.day!.metrics![k])
      if (vals.some((v) => v === null) || new Set(vals.map((v) => v!.toFixed(2))).size < 2) continue // a tie everywhere marks nothing
      const top = dir > 0 ? Math.max(...(vals as number[])) : Math.min(...(vals as number[]))
      if (Math.abs((c.day.metrics[k] ?? NaN) - top) < 0.005) out.add(k)
    }
    return out
  }
  const column = (c: TrayColumn, isPlan: boolean) => (
    <article key={c.key} className={`tray-col${isPlan ? '' : ' pin'}${c.viewing ? ' viewing' : ''}`} aria-label={`${isPlan ? 'Plan' : c.title}, ${c.detail}, ${c.when}`}
      aria-current={c.viewing ? 'true' : undefined} data-testid={isPlan ? 'tray-plan' : 'tray-pin'}>
      <header>
        <div className="tray-col-title">
          <strong>{c.title}</strong>
          {!isPlan && (
            <button type="button" className="icon-button" onClick={() => onUnpin(c.key)} aria-label={`Unpin ${c.title}`} title="Unpin">
              <PinOff size={14} aria-hidden="true" />
            </button>
          )}
        </div>
        <span><span className="site">{c.detail} ·</span><span className="nowrap">{c.when}</span></span>
      </header>
      {/* always ten rows (head, chips, six metrics, skyline, actions) shared with the label column, so values line up across */}
      <div className="tray-row">
        {c.day === null ? <p className="note">Loading terrain…</p>
          : c.day.evaluation ? <Chips evaluation={c.day.evaluation} constraints={constraints} failedOnly /> : <p className="note">Mission window runs past 2035</p>}
      </div>
      {c.day?.metrics
        ? <Summary metrics={c.day.metrics} previous={isPlan ? previous : plan.day?.metrics ?? null} testId={isPlan ? 'summary' : undefined} best={bestOf(c)} />
        : <div className="tray-metrics-empty" />}
      <div className="tray-row">
        {c.day && <Panorama mask={c.day.mask} track={c.day.track} t={Math.min(t, c.day.track.length - 1)} width={540} height={100} compact
          label={`Skyline for ${c.title}: Sun track in gold, Earth in blue`} />}
      </div>
      <footer>
        {!c.viewing && (
          <button type="button" className="quiet" onClick={() => onView(isPlan ? null : c.key)} aria-label={`View ${isPlan ? 'the plan' : c.title} in 3D`}>
            <Eye size={14} aria-hidden="true" /> View in 3D
          </button>
        )}
        {c.viewing && <span className="note">In the 3D view</span>}
        {!isPlan && c.day && (
          <button type="button" className="quiet" onClick={() => onAdopt(c.key)} aria-label={`Make ${c.title} the plan`}>
            <Target size={14} aria-hidden="true" /> Make this the plan
          </button>
        )}
      </footer>
    </article>
  )
  return (
    <section className="tray" aria-label="Compare scenarios" data-testid="tray">
      <header className="tray-head">
        <h2>Compare</h2>
        <span className="note">{pinned.length} of {TRAY_MAX} pinned · scrubbed together</span>
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
      <div className="tray-cols" style={{ gridTemplateColumns: `max-content repeat(${1 + Math.max(1, pinned.length)}, minmax(0, 1fr))` }}>
        <div className="tray-labels" aria-hidden="true">
          <span />
          <span>Constraints</span>
          {explorer ? <span className="span6" /> : ['Sunlit', 'Longest lit', 'Longest dark', 'Earth visible', 'Power index', 'Mean elevation while lit'].map((l) => <span key={l}>{l}</span>)}
          <span>Skyline</span>
          <span />
        </div>
        {column(plan, true)}
        {pinned.map((c) => column(c, false))}
        {pinned.length === 0 && (
          <p className="tray-empty">
            Pin scenarios to compare them here: <Pin size={13} aria-hidden="true" /> on a search result, or <em>Pin this view</em> for the
            current view, a nudged plan or a matrix cell you opened.
          </p>
        )}
      </div>
    </section>
  )
}
