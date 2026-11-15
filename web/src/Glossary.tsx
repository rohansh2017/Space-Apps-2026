import { useContext, useId } from 'react'
import type { ReactNode } from 'react'

import { Guide } from './guide'

/**
 * In Explorer mode, a term with its glossary definition: a tooltip on hover or keyboard focus, and the same text
 * linked with aria-describedby so screen readers read it (the visual tooltip is CSS generated content, which they skip).
 */
export function Term({ id, children }: { id: string; children: ReactNode }) {
  const { mode, glossary } = useContext(Guide)
  const tipId = useId()
  const definition = glossary.get(id.toLowerCase())
  if (mode !== 'explorer' || !definition) return <>{children}</>
  return (
    <span className="term" tabIndex={0} data-tip={definition} data-testid="term" aria-describedby={tipId}>
      {children}
      <span id={tipId} className="sr-only">{definition}</span>
    </span>
  )
}
