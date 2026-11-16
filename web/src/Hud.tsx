import { ChevronDown, ChevronUp } from 'lucide-react'

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
  open: boolean // false = the two countdowns only
  onToggle: () => void
}

const span = (h: number | null) => (h === null ? '> 30 d' : h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h`)

/** Every number here comes from the engine, never from the renderer. */
export default function Hud({ sunEl, sunHorizon, earthEl, earthHorizon, lit, link, power, sunChangeH, earthChangeH, open, onToggle }: Props) {
  return (
    <div className={open ? 'hud' : 'hud collapsed'} data-testid="hud">
      <button type="button" className="icon-button hud-toggle" onClick={onToggle} aria-expanded={open}
        aria-label={open ? 'Hide the Sun and Earth details' : 'Show the Sun and Earth details'} title={open ? 'Hide details' : 'Show details'}>
        {open ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
      </button>
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
      <dl hidden={!open}>
        <dt>Solar elevation</dt>
        <dd data-testid="hud-sun-el">{sunEl.toFixed(2)}°</dd>
        <dt className="sub">Horizon toward Sun</dt>
        <dd className="sub" data-testid="hud-sun-horizon">{sunHorizon.toFixed(2)}°</dd>
        <dt>Earth elevation</dt>
        <dd data-testid="hud-earth-el">{earthEl.toFixed(2)}°</dd>
        <dt className="sub">Horizon toward Earth</dt>
        <dd className="sub" data-testid="hud-earth-horizon">{earthHorizon.toFixed(2)}°</dd>
        <dt>Sun</dt>
        <dd data-testid="hud-lit" className={lit > 0 ? 'sunlit' : 'bad'}>{lit > 0 ? `Lit ${(lit * 100).toFixed(0)}%` : 'Dark'}</dd>
        <dt>Earth link</dt>
        <dd data-testid="hud-link" className={link ? 'ok' : 'bad'}>{link ? 'Link' : 'No link'}</dd>
        <dt>Power index</dt>
        <dd data-testid="hud-power">{power.toFixed(2)}</dd>
      </dl>
    </div>
  )
}
