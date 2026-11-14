import { useEffect, useMemo, useRef, useState } from 'react'
import Chips from './Chips'
import ConstraintPanel from './ConstraintPanel'
import type { Dataset, Region } from './data'
import { loadDataset, loadRegion } from './data'
import type { Constraints } from './engine/engine'
import { buildSeries, evaluate, nextChange, siteAngles, siteFrame, windowMetrics } from './engine/engine'
import type { Candidate, FinderResult } from './engine/finder'
import type { FinderRequest } from './engine/finder.worker'
import Hud from './Hud'
import Panorama from './Panorama'
import { defaults } from './presets'
import Results from './Results'
import Scene3D from './Scene3D'

const LUNAR_DAY_H = 708
const LOOKAHEAD_H = 720 // countdowns look this far past the scrubbed lunar day
const HOUR_MS = 3_600_000
const START_HOUR = 7728 // 2026-11-19 00:00 UTC
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16)

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState('')
  const [siteId, setSiteId] = useState('')
  const [planHour, setPlanHour] = useState(START_HOUR) // the planned landing hour
  const [offset, setOffset] = useState(0) // scrubber position within the lunar day
  const [constraints, setConstraints] = useState<Constraints>({})
  const [regions, setRegions] = useState<Record<string, Region>>({})
  const [found, setFound] = useState<{ finder: FinderResult; candidates: Candidate[] } | null>(null)
  const [opened, setOpened] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const worker = useRef<Worker | null>(null)

  useEffect(() => {
    loadDataset().then((d) => {
      setData(d)
      setSiteId(d.sites[0].id)
      setConstraints(defaults(d.constraintDefs))
    }, (e) => setError(String(e)))
    return () => worker.current?.terminate()
  }, [])

  const site = data?.sites.find((s) => s.id === siteId)
  useEffect(() => {
    if (!site?.terrain) return
    let live = true
    loadRegion(site.id).then((r) => live && setRegions((all) => ({ ...all, [site.id]: r })), (e) => setError(String(e)))
    return () => {
      live = false
    }
  }, [site])

  /** The plan: the chosen site's own grid point. */
  const plan = useMemo((): Candidate | null => {
    if (!data || !site) return null
    const region = regions[site.id]
    if (site.terrain && !region) return null
    const i = data.centreIndex
    const point = data.points.find((p) => p.region === site.id && p.index === i)
    return {
      id: point?.id ?? site.id, label: site.name, lat: site.lat, lon: site.lon, elevM: point?.elev_m ?? 0,
      slopeDeg: region ? region.slopes[i] : 0,
      mask: region ? region.masks.subarray(i * 360, (i + 1) * 360) : new Uint16Array(360).fill(1000),
    }
  }, [data, site, regions])

  const alt = found && opened !== null ? found.finder.results[opened] : null
  const observer = alt ? found!.candidates[alt.candidate] : plan
  const viewStart = alt ? alt.start : planHour

  const view = useMemo(() => {
    if (!data || !site || !observer || !plan || constraints.mission_duration_days === undefined) return null
    const frame = siteFrame(observer.lat, observer.lon, observer.elevM)
    const mask = site.terrain ? observer.mask : null
    const n = Math.min(LUNAR_DAY_H + LOOKAHEAD_H, data.hours - viewStart)
    const series = buildSeries(data.ephemeris, viewStart, n, frame, mask, Number(constraints.min_earth_elevation_deg))
    const track = []
    for (let h = 0; h <= Math.min(LUNAR_DAY_H, n - 1); h++) track.push(siteAngles(data.ephemeris, viewStart + h, frame))
    const t = Math.min(offset, track.length - 1)
    const dur = Math.round(Number(constraints.mission_duration_days) * 24)
    const metrics = dur <= n ? windowMetrics(series, 0, dur) : null
    // observer offset from the site centre in the site's east/north axes, metres
    const home = siteFrame(site.lat, site.lon, plan.elevM)
    const d = frame.pos.map((v, i) => (v - home.pos[i]) * 1000)
    const dot = (a: number[]) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]
    return {
      mask, track, t, now: track[t],
      lit: series.frac[t],
      link: series.earth[t] === 1,
      power: series.frac[t] * Math.cos((series.sunEl[t] * Math.PI) / 180),
      sunChangeH: nextChange(series.litLeft, t),
      earthChangeH: nextChange(series.earthLeft, t),
      metrics,
      evaluation: metrics && evaluate(metrics, observer.slopeDeg, constraints),
      east: dot(home.east), north: dot(home.north),
      earthDistKm: data.ephemeris[(viewStart + t) * 7 + 6],
    }
  }, [data, site, observer, plan, viewStart, offset, constraints])

  const clearResults = () => {
    setFound(null)
    setOpened(null)
  }

  async function runFinder() {
    if (!data || !site || !plan) return
    setBusy(true)
    try {
      // candidates: the plan first, then its grid within the search radius, then the other curated sites
      const terrain = data.sites.filter((s) => s.terrain)
      const loaded = Object.fromEntries(await Promise.all(terrain.map(async (s) => [s.id, await loadRegion(s.id)] as const)))
      const radiusM = Number(constraints.search_radius_km) * 1000
      const centre = data.points.find((p) => p.region === site.id && p.index === data.centreIndex)!
      const candidates: Candidate[] = [plan]
      for (const p of data.points) {
        const own = p.region === site.id
        if (own ? p.index === data.centreIndex || Math.hypot(p.x - centre.x, p.y - centre.y) > radiusM : p.index !== data.centreIndex) continue
        const r = loaded[p.region]
        candidates.push({
          id: p.id, label: terrain.find((s) => s.id === p.region)!.name, lat: p.lat, lon: p.lon, elevM: p.elev_m,
          slopeDeg: r.slopes[p.index], mask: r.masks.subarray(p.index * 360, (p.index + 1) * 360),
        })
      }
      worker.current ??= new Worker(new URL('./engine/finder.worker.ts', import.meta.url), { type: 'module' })
      const request: FinderRequest = { table: data.ephemeris, tableHours: data.hours, candidates, start: planHour, constraints }
      const reply = await new Promise<{ ok: boolean; result?: FinderResult; error?: string }>((resolve) => {
        worker.current!.onmessage = (e) => resolve(e.data)
        worker.current!.postMessage(request)
      })
      if (!reply.ok) throw new Error(reply.error)
      setFound({ finder: reply.result!, candidates })
      setOpened(null)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }

  if (error) return <main><p role="alert">Something went wrong: {error}</p></main>
  if (!data || !site) return <main><p>Loading…</p></main>

  const date = (hour: number) => iso(data.startMs + hour * HOUR_MS).replace('T', ' ')
  return (
    <main>
      <header>
        <h1>Tranquility Base</h1>
        <p className="note">Lunar south-pole landing site navigator</p>
      </header>
      {data.synthetic && <p className="banner" role="status">Synthetic data: development fixtures, not real terrain or ephemeris.</p>}
      <div className="layout">
        <aside>
          <section className="panel" aria-label="Plan">
            <h2>Plan</h2>
            <label className="row">
              <span>Site</span>
              <select value={siteId} onChange={(e) => { setSiteId(e.target.value); clearResults() }}>
                {data.sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.approximate ? ' (approx.)' : ''}</option>)}
              </select>
            </label>
            <label className="row">
              <span>Landing date and time (UTC)</span>
              <input
                type="datetime-local"
                step={3600}
                value={iso(data.startMs + planHour * HOUR_MS)}
                min={iso(data.startMs)}
                max={iso(data.startMs + (data.hours - 1) * HOUR_MS)}
                onChange={(e) => {
                  const h = Math.round((Date.parse(e.target.value + 'Z') - data.startMs) / HOUR_MS)
                  if (Number.isFinite(h) && h >= 0 && h < data.hours) {
                    setPlanHour(h)
                    setOffset(0)
                    clearResults()
                  }
                }}
              />
            </label>
            <p className="note">{site.mission} · {site.agency}<br />{site.lat.toFixed(3)}°, {site.lon.toFixed(3)}°E · {site.coord_source}</p>
          </section>
          <ConstraintPanel defs={data.constraintDefs} value={constraints} onChange={(c) => { setConstraints(c); clearResults() }} />
          <button type="button" className="primary" disabled={busy || !site.terrain || !plan} onClick={runFinder}>
            {busy ? 'Searching…' : 'Find alternatives'}
          </button>
          {!site.terrain && <p className="note">This site has no terrain (angle validation only), so the finder is off.</p>}
        </aside>
        <div className="stage">
          {!view || !observer ? <p>Loading terrain…</p> : (
            <>
              <div
                className="status"
                data-testid="view"
                data-lat={observer.lat}
                data-lon={observer.lon}
                data-elev={observer.elevM}
                data-point={observer.id}
                data-hour={viewStart + view.t}
                data-east={view.east.toFixed(0)}
                data-north={view.north.toFixed(0)}
              >
                <strong>{alt ? 'Alternative' : 'Plan'}: {observer.label}</strong>
                <span>{date(viewStart)} UTC landing</span>
                {view.evaluation ? <Chips evaluation={view.evaluation} /> : <span className="note">Mission window runs past 2035</span>}
              </div>
              <div className="viewport">
                {site.terrain
                  ? <Scene3D site={site} east={view.east} north={view.north} mask={view.mask} sunAz={view.now.sunAz} sunEl={view.now.sunEl}
                      sunFraction={view.lit} earthAz={view.now.earthAz} earthEl={view.now.earthEl} earthDistKm={view.earthDistKm} />
                  : <p className="note empty">No terrain for this site: it is used to validate Sun and Earth angles only, so the horizon below is flat.</p>}
                <Hud sunEl={view.now.sunEl} earthEl={view.now.earthEl} lit={view.lit} link={view.link} power={view.power}
                  sunChangeH={view.sunChangeH} earthChangeH={view.earthChangeH} />
              </div>
              {site.heightmap && Math.max(Math.abs(view.east), Math.abs(view.north)) >= site.heightmap.span_m / 2 - 20 && (
                <p className="note" data-testid="level-ground-note">
                  This point is outside the 5 × 5 km terrain patch around the site centre, so the 3D ground is drawn level.
                  The horizon ring, the panorama and every number still use this point's own terrain.
                </p>
              )}
              <label className="scrub">
                <span>Lunar day scrubber · {date(viewStart + view.t)} UTC (landing +{view.t} h)</span>
                <input type="range" min={0} max={view.track.length - 1} value={view.t} onChange={(e) => setOffset(Number(e.target.value))} />
              </label>
              <Panorama mask={view.mask} track={view.track} now={view.now} />
              {found && <Results finder={found.finder} candidates={found.candidates} opened={opened} date={date}
                onOpen={(i) => { setOpened(i); setOffset(0) }} />}
            </>
          )}
        </div>
      </div>
      <footer>
        Screening-grade results: 500 m search grid, 20 m terrain within 10 km and 80 m beyond. Not a
        mission design, hazard, power, thermal or link-budget tool. Data: NASA/JPL DE440, LRO LOLA
        (NASA GSFC PGDA).
      </footer>
    </main>
  )
}
