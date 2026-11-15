import { useState } from 'react'
import type { WhyNotFacts } from './whynot'
import { askWhyNot, looksLikeWhyNot, whyNotNumbersOk, whyNotText } from './whynot'

/** F27: why a plan or result fails and what would make it pass. Template always; Gemini only when asked (`ask`). */
export default function WhyNotLine({ facts, ask = false, testId }: { facts: WhyNotFacts; ask?: boolean; testId: string }) {
  const [stored, setStored] = useState<{ key: string; text: string; note: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const key = JSON.stringify(facts)
  const generated = stored?.key === key ? stored : null
  const template = whyNotText(facts)
  if (!template) return null
  const rephrase = async () => {
    setBusy(true)
    try {
      const text = await askWhyNot(facts)
      setStored({ key, ...(looksLikeWhyNot(text) && whyNotNumbersOk(text, facts)
        ? { text, note: 'Rephrased by Gemini from engine facts; every number checked.' }
        : { text: template, note: 'Gemini\'s wording did not match the facts, so the engine\'s sentence is shown.' }) })
    } catch (e) {
      setStored({ key, text: template, note: `${e instanceof Error ? e.message : String(e)}; the engine's sentence is shown.` })
    } finally {
      setBusy(false)
    }
  }
  return (
    <p className="note whynot" data-testid={testId}>
      <strong>Why not?</strong> <span data-testid={`${testId}-text`}>{generated ? generated.text : template}</span>
      {ask && (
        <>
          {' '}
          {generated && <span className="note" data-testid={`${testId}-note`}>{generated.note} </span>}
          <button type="button" disabled={busy} onClick={rephrase}>{busy ? 'Asking Gemini…' : 'Say it plainly'}</button>
        </>
      )}
    </p>
  )
}
