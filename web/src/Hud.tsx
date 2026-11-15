import { useContext } from 'react'
import { Term } from './Glossary'
import { Guide, sunWords } from './guide'

interface Props {
  sunEl: number
  sunHorizon: number // terrain elevation at the Sun's azimuth (engine maskAt), degrees
  earthEl: number
  earthHorizon: number // terrain elevation at Earth's azimuth, degrees
  lit: number // Sun visible fraction 0..1
  link: boolean
  power: number
  sunChangeH: number | null // hours to sunset when lit, to sunrise when dark; null = beyond the computed horizon
  earthChangeH: number | null
}

const span = (h: number | null) => (h === null ? '> 30 d' : h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h`)

/** Every number here comes from the engine, never from the renderer. */
export default function Hud({ sunEl, sunHorizon, earthEl, earthHorizon, lit, link, power, sunChangeH, earthChangeH }: Props) {
  const explorer = useContext(Guide).mode === 'explorer'
  return (
    <div className="hud" data-testid="hud">
      <div className="hud-big">
        <div>
          <small>{lit > 0 ? 'Sunset in' : 'Sunrise in'}</small>
          <strong data-testid="hud-sun-countdown">{span(sunChangeH)}</strong>
        </div>
        <div>
          <small>{link ? 'Earthset in' : 'Earthrise in'}</small>
          <strong data-testid="hud-earth-countdown">{span(earthChangeH)}</strong>
        </div>
      </div>
      <dl>
        <dt><Term id="Solar elevation">Solar elevation</Term></dt>
        <dd data-testid="hud-sun-el">{sunEl.toFixed(2)}°</dd>
        <dt className="sub"><Term id="Horizon mask">Horizon toward Sun</Term></dt>
        <dd className="sub" data-testid="hud-sun-horizon">{sunHorizon.toFixed(2)}°</dd>
        <dt>Earth elevation</dt>
        <dd data-testid="hud-earth-el">{earthEl.toFixed(2)}°</dd>
        <dt className="sub">Horizon toward Earth</dt>
        <dd className="sub" data-testid="hud-earth-horizon">{earthHorizon.toFixed(2)}°</dd>
        <dt>Sun</dt>
        <dd data-testid="hud-lit" className={lit > 0 ? 'sunlit' : 'bad'}>{lit > 0 ? `Lit ${(lit * 100).toFixed(0)}%` : 'Dark'}</dd>
        <dt><Term id="Earth link">Earth link</Term></dt>
        <dd data-testid="hud-link" className={link ? 'ok' : 'bad'}>{link ? 'Link' : 'No link'}</dd>
        <dt><Term id="Power index">Power index</Term></dt>
        <dd data-testid="hud-power">
          {explorer && <span className="battery" aria-hidden="true"><i style={{ width: `${Math.round(power * 100)}%` }} /></span>}
          {power.toFixed(2)}
        </dd>
      </dl>
      {explorer && (
        <p className="hud-words" data-testid="hud-words">
          {sunWords(lit)}. {link ? 'You can call home.' : 'Earth is hidden, so there is no direct link.'}
        </p>
      )}
    </div>
  )
}
