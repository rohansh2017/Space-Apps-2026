import { Crosshair, Eye, Globe, GripVertical, Pin, PinOff, Target } from 'lucide-react'
import { useState } from 'react'
import Chips from './Chips'
import type { Angles, Constraints, Evaluation, Metrics } from './engine/engine'
import Panorama from './Panorama'
import Summary from './Summary'

export interface TrayColumn {
  key: string // the pin's "region:index@hour"
  title: string // "5.0 km S · +16 days" relative to the plan
  detail: string // site
  when: string // landing time, kept on one line
  viewing: boolean // this scenario is the one on the stage (the 3D view or the Moon view)
  letter: string // the letter that marks this scenario on the Moon view (A for the first column)
  isPlan: boolean // the same point and landing hour as the current plan
  day: { mask: Uint16Array | null; track: Angles[]; metrics: Metrics | null; evaluation: Evaluation | null } | null // null while its terrain loads
}

interface Props {
  pinned: TrayColumn[] // frozen scenarios (point + landing hour), in the user's order
  baseline: string | null // the column the others are compared to; null = the first column
  t: number // scrubber hour, shared by every column
  constraints: Constraints
  pending: { title: string } | null // a pin waiting for a free column
  stage: 'moon' | 'ground' // which view the stage shows
  onView: (key: string) => void
  onMoon: (key: string) => void // show this scenario's point on the Moon view
  onUnpin: (key: string) => void
  onAdopt: (key: string) => void // make this pin the plan; the old plan takes its column
  onSetBaseline: (key: string) => void
  onMove: (from: number, to: number) => void // reorder: the column at `from` goes to index `to`
  onReplace: (key: string) => void
  onCancelPending: () => void
  onPinView: () => void // pins what is in view, or unpins it when it is already pinned
  viewPinned: boolean // what is in view is already a column
  canPin: boolean // false only while the view's terrain loads
}

export const TRAY_MAX = 4 // columns in the tray

// which way is better for each metric, to mark the best value in each tray row
type Key = 'sunlitPct' | 'longestLitH' | 'longestDarkH' | 'earthPct' | 'powerIndex' | 'meanElLit'
const BETTER: Record<Key, 1 | -1> = { sunlitPct: 1, longestLitH: 1, longestDarkH: -1, earthPct: 1, powerIndex: 1, meanElLit: 1 }

/** The compare tray: up to four pinned scenarios, drawn the same way, scrubbed together, compared to one baseline, reordered by drag or Alt+arrows. */
export default function Tray({ pinned, baseline, t, constraints, pending, stage, onView, onMoon, onUnpin, onAdopt, onSetBaseline, onMove,
  onReplace, onCancelPending, onPinView, viewPinned, canPin }: Props) {
  const columns = pinned
  const [drag, setDrag] = useState<{ from: number; over: number | null } | null>(null)
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
  /** Alt+Left / Alt+Right on a column's grip moves it one place. */
  const moveKey = (i: number) => (e: React.KeyboardEvent) => {
    if (!e.altKey || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const to = i + (e.key === 'ArrowLeft' ? -1 : 1)
    if (to >= 0 && to < columns.length) onMove(i, to)
  }
  const column = (c: TrayColumn, i: number) => {
    const isBase = c === base
    const target = drag && drag.over === i && drag.from !== i ? (drag.from < i ? ' drop-after' : ' drop-before') : ''
    return (
      <article key={c.key} className={`tray-col${isBase ? ' base' : ' compared'}${c.viewing ? ' viewing' : ''}${drag?.from === i ? ' dragging' : ''}${target}`}
        aria-label={`${c.letter}: ${c.title}, ${c.detail}, ${c.when}${isBase && columns.length > 1 ? ', the baseline' : ''}`}
        aria-current={c.viewing ? 'true' : undefined} data-testid="tray-pin" data-key={c.key}
        onDragOver={(e) => {
          if (!drag) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'move'
          if (drag.over !== i) setDrag({ ...drag, over: i })
        }}
        onDrop={(e) => {
          e.preventDefault()
          if (drag && drag.from !== i) onMove(drag.from, i)
          setDrag(null)
        }}>
        <header>
          <div className="tray-col-title">
            <button type="button" className="icon-button tray-grip" draggable aria-label={`Move ${c.letter}, ${c.title}: drag it, or press Alt with the left or right arrow`}
              title="Drag to reorder (or Alt + arrow keys)" data-testid="tray-grip"
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move'
                e.dataTransfer.setData('text/plain', c.key)
                setDrag({ from: i, over: null })
              }}
              onDragEnd={() => setDrag(null)} onKeyDown={moveKey(i)}>
              <GripVertical size={14} aria-hidden="true" />
            </button>
            <strong><span className="tray-letter" title="Its letter on the Moon view">{c.letter}</span>{c.title}</strong>
            <button type="button" className="icon-button" onClick={() => onUnpin(c.key)} aria-label={`Unpin ${c.title}`} title="Unpin">
              <PinOff size={14} aria-hidden="true" />
            </button>
          </div>
          <span><span className="site">{c.detail} ·</span><span className="nowrap">{c.when}</span></span>
          {c.isPlan && <span className="plan-tag" data-testid="plan-tag">The plan</span>}
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
          ? <Summary metrics={c.day.metrics} previous={isBase ? null : base.day?.metrics ?? null} best={bestOf(c)} />
          : <div className="tray-metrics-empty" />}
        <div className="tray-row">
          {c.day && <Panorama mask={c.day.mask} track={c.day.track} t={Math.min(t, c.day.track.length - 1)} width={540} height={100} compact
            label={`Skyline for ${c.title}: Sun track in gold, Earth in blue`} />}
        </div>
        <footer>
          {!(c.viewing && stage === 'ground') && (
            <button type="button" className="quiet" onClick={() => onView(c.key)} aria-label={`View ${c.title} in 3D`}>
              <Eye size={14} aria-hidden="true" /> View in 3D
            </button>
          )}
          {!(c.viewing && stage === 'moon') && c.day && (
            <button type="button" className="quiet" onClick={() => onMoon(c.key)} aria-label={`Show ${c.title} on the Moon`}>
              <Globe size={14} aria-hidden="true" /> Show on the Moon
            </button>
          )}
          {c.viewing && <span className="note">{stage === 'moon' ? 'On the Moon view' : 'In the 3D view'}</span>}
          {!c.isPlan && c.day && (
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
        {columns.length > 1 && <span className="note compared-to" data-testid="compared-to">Compared to <strong>{base.letter} · {base.title}</strong></span>}
        <button type="button" className={viewPinned ? 'quiet' : 'pin-view'} onClick={onPinView} disabled={!canPin} aria-pressed={viewPinned}>
          {viewPinned ? <PinOff size={14} aria-hidden="true" /> : <Pin size={14} aria-hidden="true" />}
          {viewPinned ? 'Unpin this view' : 'Pin this view'}
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
            {['Sunlit', 'Longest lit', 'Longest dark', 'Earth visible', 'Power index', 'Mean elevation while lit'].map((l) => <span key={l}>{l}</span>)}
            <span>Skyline</span>
            <span />
          </div>
          {columns.map(column)}
      </div>
    </section>
  )
}
