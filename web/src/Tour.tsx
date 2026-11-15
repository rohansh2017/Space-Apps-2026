import { useEffect, useRef, useState } from 'react'

interface Step {
  id: string
  title: string
  body: string
}

interface Props {
  steps: Step[]
  onStep: (id: string) => void // the app reacts to a step (e.g. starts playback)
  onClose: () => void
}

/** Sketch for step 1: on Earth the Sun climbs steeply; at the Moon's south pole it skims the ridgeline. */
function SunriseContrast() {
  return (
    <svg viewBox="0 0 420 120" role="img" aria-label="Sketch: on Earth the Sun's path rises steeply; at the lunar south pole it runs almost level with the horizon">
      <g fontSize="11" fill="#9aa3b5" fontFamily="system-ui">
        <text x="12" y="16">Earth</text>
        <text x="222" y="16">Moon, south pole</text>
      </g>
      <path d="M10 100 H200" stroke="#6c7689" />
      <path d="M30 100 Q105 -40 180 100" fill="none" stroke="#f2c94c" strokeWidth="2" strokeDasharray="4 3" />
      <circle cx="80" cy="46" r="6" fill="#ffd84a" />
      <path d="M220 100 L245 92 L262 97 L280 84 L300 90 L318 86 L340 95 L362 88 L384 94 L410 100 V120 H220 Z" fill="#4a4f5c" />
      <path d="M220 86 Q315 72 410 86" fill="none" stroke="#f2c94c" strokeWidth="2" strokeDasharray="4 3" />
      <circle cx="300" cy="80" r="6" fill="#ffd84a" />
    </svg>
  )
}

export default function Tour({ steps, onStep, onClose }: Props) {
  const [i, setI] = useState(0)
  const box = useRef<HTMLElement>(null)
  const step = steps[i]
  const last = i + 1 === steps.length
  useEffect(() => onStep(steps[0].id), []) // eslint-disable-line react-hooks/exhaustive-deps -- fire once for the first step
  useEffect(() => box.current?.focus(), []) // the tour takes focus when it opens
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const go = (n: number) => {
    setI(n)
    onStep(steps[n].id)
  }
  return (
    <section className="panel tour" role="dialog" aria-label="Guided tour" data-testid="tour" ref={box} tabIndex={-1}>
      <h2>Why is the pole so hard? · step {i + 1} of {steps.length}</h2>
      <div aria-live="polite">
        <h3>{step.title}</h3>
        {i === 0 && <SunriseContrast />}
        <p>{step.body}</p>
      </div>
      <div className="tour-nav">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0}>Back</button>
        {/* one button that changes from Next to Finish, so keyboard focus is not lost on the last step */}
        <button type="button" className="primary" onClick={() => (last ? onClose() : go(i + 1))}>{last ? 'Finish' : 'Next'}</button>
        <button type="button" onClick={onClose} aria-label="Close tour (Escape)">Close</button>
      </div>
    </section>
  )
}
