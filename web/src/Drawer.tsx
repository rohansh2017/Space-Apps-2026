import { X } from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { useEffect, useRef } from 'react'

interface Props {
  title: string
  onClose: () => void
  returnFocus?: RefObject<HTMLButtonElement | null> // the button that opened it
  side: 'left' | 'right' | 'wide'
  children: ReactNode
  testId?: string
}

/** A non-modal drawer over the 3D view: takes focus when it opens, closes on Escape, hands focus back. */
export default function Drawer({ title, onClose, returnFocus, side, children, testId }: Props) {
  const box = useRef<HTMLElement>(null)
  useEffect(() => {
    box.current?.focus()
    const back = returnFocus?.current
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back?.focus()
    }
  }, [onClose, returnFocus])
  return (
    <section className={`drawer drawer-${side}`} role="dialog" aria-label={title} ref={box} tabIndex={-1} data-testid={testId}>
      <header className="drawer-head">
        <h2>{title}</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label={`Close ${title.toLowerCase()} (Escape)`}>
          <X size={16} aria-hidden="true" />
        </button>
      </header>
      <div className="drawer-body">{children}</div>
    </section>
  )
}
