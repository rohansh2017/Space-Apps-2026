import { X } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CoachStep, Prepare, Snapshot } from './onboarding'

interface Props {
  steps: CoachStep[]
  snapshot: Snapshot
  onPrepare: (p: Prepare) => void
  onAnnounce: (text: string) => void // the app's one polite live region
  onClose: () => void
}

type Box = { left: number; top: number; width: number; height: number }
const PAD = 6 // ring clearance around the target
const GAP = 12 // card distance from the target
const NARROW = 640 // below this the card docks at the bottom

/**
 * F28: a callout beside one real control at a time, with a ring around it. The ring and the dimming take no clicks,
 * so the user presses the real control; the step moves on when the app's state shows they did.
 */
export default function Coach({ steps, snapshot, onPrepare, onAnnounce, onClose }: Props) {
  const [i, setI] = useState(0)
  const [praise, setPraise] = useState(false)
  const [target, setTarget] = useState<Box | null>(null)
  const [card, setCard] = useState<{ w: number; h: number }>({ w: 320, h: 140 })
  const [view, setView] = useState({ w: window.innerWidth, h: window.innerHeight })
  const start = useRef(snapshot)
  const box = useRef<HTMLElement>(null)
  const step = steps[i]
  const last = i + 1 === steps.length

  // a new step: remember where things stood, show what it needs, take focus and say what to do
  useEffect(() => {
    start.current = snapshot
    if (step.prepare) onPrepare(step.prepare)
    box.current?.focus()
    onAnnounce(`Tour step ${i + 1} of ${steps.length}: ${step.title}. ${step.body}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i])

  // the user did it: a short "Nice!", then the next step. The timer lives in a ref: the snapshot changes every frame
  // during playback, and an effect cleanup would cancel it.
  const advance = useRef(0)
  useEffect(() => {
    if (praise || !step.done || !step.done(snapshot, start.current)) return
    setPraise(true)
    advance.current = window.setTimeout(() => {
      setPraise(false)
      setI((n) => Math.min(n + 1, steps.length - 1))
    }, 700)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, i])
  useEffect(() => () => window.clearTimeout(advance.current), [])
  const skip = () => {
    window.clearTimeout(advance.current)
    setPraise(false)
    setI((n) => Math.min(n + 1, steps.length - 1))
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // follow the target every frame: pins ride the turning globe, panels slide; re-render only when it moved
  useEffect(() => {
    let frame = 0
    let prev = ''
    const tick = () => {
      const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
      const r = el?.getBoundingClientRect()
      const shown = r && r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
        && getComputedStyle(el!).visibility !== 'hidden'
      const next: Box | null = shown ? { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) } : null
      const key = JSON.stringify(next)
      if (key !== prev) {
        prev = key
        setTarget(next)
      }
      frame = requestAnimationFrame(tick)
    }
    tick()
    const onResize = () => setView({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', onResize)
    }
  }, [step.target])

  // the card's own size, for placing it (it changes with the step's text and the "Nice!" title)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    const measure = () => setCard({ w: Math.round(el.offsetWidth), h: Math.round(el.offsetHeight) })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // place the card below the target, else above, else beside; clamped to the window; docked at the bottom on phones
  let style: React.CSSProperties
  // phones: full width, docked at the edge away from the target so it never covers the control it asks for
  if (view.w < NARROW) style = target && target.top + target.height / 2 > view.h / 2 ? { left: 16, right: 16, top: 64 } : { left: 16, right: 16, bottom: 16 }
  else if (!target) style = { left: Math.max(16, (view.w - card.w) / 2), top: Math.max(16, (view.h - card.h) / 2) }
  else {
    const clampX = (x: number) => Math.min(Math.max(16, x), view.w - card.w - 16)
    const clampY = (y: number) => Math.min(Math.max(16, y), view.h - card.h - 16)
    const below = target.top + target.height + PAD + GAP
    const above = target.top - PAD - GAP - card.h
    if (below + card.h <= view.h - 16) style = { left: clampX(target.left + target.width / 2 - card.w / 2), top: below }
    else if (above >= 16) style = { left: clampX(target.left + target.width / 2 - card.w / 2), top: above }
    else {
      const right = target.left + target.width + PAD + GAP
      style = { left: right + card.w <= view.w - 16 ? right : clampX(target.left - PAD - GAP - card.w), top: clampY(target.top + target.height / 2 - card.h / 2) }
    }
  }
  const missing = step.target !== null && !target

  return (
    <>
      {target && (
        <div className="coach-spot" aria-hidden="true" data-testid="coach-spot"
          style={{ left: target.left - PAD, top: target.top - PAD, width: target.width + 2 * PAD, height: target.height + 2 * PAD }} />
      )}
      <section className="coach" role="dialog" aria-label="Quick tour" aria-describedby="coach-body" ref={box} tabIndex={-1}
        style={style} data-testid="coach" data-step={step.id}>
        <div className="coach-head">
          <span className="coach-count">{i + 1} / {steps.length}</span>
          <button type="button" className="icon-button" onClick={onClose} aria-label="End the tour (Escape)" title="End the tour">
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <h2>{praise ? 'Nice!' : step.title}</h2>
        <p id="coach-body">{step.body}{missing && ' (It is just off screen: scroll or open the panel to find it.)'}</p>
        <div className="coach-nav">
          {last
            ? <button type="button" className="primary" onClick={onClose}>Finish</button>
            : <button type="button" onClick={skip} disabled={praise}>Skip</button>}
        </div>
      </section>
    </>
  )
}
