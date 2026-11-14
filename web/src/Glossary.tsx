import { useContext } from 'react'
import type { ReactNode } from 'react'

import { Guide } from './guide'

/** In Explorer mode, a term with its glossary definition as a tooltip (hover or keyboard focus). */
export function Term({ id, children }: { id: string; children: ReactNode }) {
  const { mode, glossary } = useContext(Guide)
  const definition = glossary.get(id.toLowerCase())
  if (mode !== 'explorer' || !definition) return <>{children}</>
  return (
    <span className="term" tabIndex={0} data-tip={definition} data-testid="term">
      {children}
    </span>
  )
}
