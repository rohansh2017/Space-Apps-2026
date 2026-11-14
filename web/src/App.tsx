import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Chips from './Chips'
import Compare from './Compare'
import ConstraintPanel from './ConstraintPanel'
import type { Dataset, Region } from './data'
import { loadDataset, loadRegion } from './data'
import type { Constraints, Metrics } from './engine/engine'
import { buildSeries, evaluate, nextChange, nudgeNeighbour, siteAngles, siteFrame, snapToGrid, windowMetrics } from './engine/engine'
import type { Candidate, FinderResult } from './engine/finder'
import type { FinderRequest } from './engine/finder.worker'
import type { Mode } from './guide'
import { Guide } from './guide'
import Hud from './Hud'
import Matrix from './Matrix'
import Panorama from './Panorama'
import { defaults } from './presets'
import Results from './Results'
import Scene3D from './Scene3D'
import SiteMap from './SiteMap'
import Summary from './Summary'
import Tour from './Tour'

const LUNAR_DAY_H = 708
const LOOKAHEAD_H = 720 // countdowns look this far past the scrubbed lunar day
const PLAYBACK_S = 20 // one lunar day of playback
const SNAP_LIMIT_M = 500 // a custom coordinate farther than this from every grid point is outside the regions
const HOUR_MS = 3_600_000
const START_HOUR = 7728 // 2026-11-19 00:00 UTC
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16)

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('planner')
  const [siteId, setSiteId] = useState('')
  const [pointIndex, setPointIndex] = useState<number | null>(null) // grid point within the site's region; null = the site itself
  const [snapNote, setSnapNote] = useState('')
  const [custom, setCustom] = useState({ lat: '', lon: '' })
  const [planHour, setPlanHour] = useState(START_HOUR) // the planned landing hour
  const [offset, setOffset] = useState(0) // scrubber position within the lunar day
  const [playing, setPlaying] = useState(false)
  const [constraints, setConstraints] = useState<Constraints>({})
  const [regions, setRegions] = useState<Record<string, Region>>({})
  const [found, setFound] = useState<{ finder: FinderResult; candidates: Candidate[] } | null>(null)
  const [opened, setOpened] = useState<number | null>(null)
  const [matrix, setMatrix] = useState(false)
  const [nudgeFrom, setNudgeFrom] = useState<Metrics | null>(null) // F14: metrics before the last nudge
  const [tour, setTour] = useState(false)
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

  const clearResults = useCallback(() => {
    setFound(null)
    setOpened(null)
    setPlaying(false)
    setNudgeFrom(null)
  }, [])

  const selectSite = useCallback((id: string, index: number | null = null) => {
    setSiteId(id)
    setPointIndex(index)
    setOffset(0)
    clearResults()
  }, [clearResults])

  /** F1 custom coordinates and map clicks: snap to the nearest precomputed grid point and say how far it moved. */
  const locate = useCallback((lat: number, lon: number) => {
    if (!data) return
    // regions overlap (Shackleton rim and the peak beside it), so a point inside the current site's grid stays with that site
    const own = snapToGrid(data.points.filter((p) => p.region === siteId), lat, lon)
    const { point, distanceM } = own.point && own.distanceM <= SNAP_LIMIT_M ? own : snapToGrid(data.points, lat, lon)
    const name = data.sites.find((s) => s.id === point.region)!.name
    if (distanceM > SNAP_LIMIT_M) {
      setSnapNote(`${lat.toFixed(3)}°, ${lon.toFixed(2)}°E is outside the precomputed regions. The nearest grid point is ${(distanceM / 1000).toFixed(1)} km away, at ${name}. Pick a point inside a site's 10 km search grid.`)
      return
    }
    setSnapNote(`Snapped ${distanceM.toFixed(0)} m to the nearest grid point, at ${point.lat.toFixed(4)}°, ${point.lon.toFixed(3)}°E (${name}).`)
    selectSite(point.region, point.index === data.centreIndex ? null : point.index)
  }, [data, siteId, selectSite])

  const planPoint = useMemo(
    () => (data && site?.terrain ? data.points.find((p) => p.region === site.id && p.index === (pointIndex ?? data.centreIndex)) ?? null : null),
    [data, site, pointIndex],
  )

  /** The plan: the chosen grid point (the site's own point unless a custom coordinate was picked). */
  const plan = useMemo((): Candidate | null => {
    if (!data || !site) return null
    const region = regions[site.id]
    if (site.terrain && (!region || !planPoint)) return null
    if (!planPoint) return { id: site.id, label: site.name, lat: site.lat, lon: site.lon, elevM: 0, slopeDeg: 0, mask: new Uint16Array(360).fill(1000) }
    const i = planPoint.index
    return {
      id: planPoint.id, label: pointIndex === null ? site.name : `${site.name}, custom point`,
      lat: pointIndex === null ? site.lat : planPoint.lat, lon: pointIndex === null ? site.lon : planPoint.lon, elevM: planPoint.elev_m,
      slopeDeg: region.slopes[i], mask: region.masks.subarray(i * 360, (i + 1) * 360),
    }
  }, [data, site, regions, planPoint, pointIndex])

  const alt = found && opened !== null ? found.finder.results[opened] : null
  const observer = alt ? found!.candidates[alt.candidate] : plan
  const viewStart = alt ? alt.start : planHour

  /** Everything about one observer's lunar day from a landing hour that does not depend on the scrubber position. */
  const dayOf = useCallback((obs: Candidate, start: number) => {
    if (!data || !site || !plan || constraints.mission_duration_days === undefined) return null
    const frame = siteFrame(obs.lat, obs.lon, obs.elevM)
    const mask = site.terrain ? obs.mask : null
    const n = Math.min(LUNAR_DAY_H + LOOKAHEAD_H, data.hours - start)
    const series = buildSeries(data.ephemeris, start, n, frame, mask, Number(constraints.min_earth_elevation_deg))
    const track = []
    for (let h = 0; h <= Math.min(LUNAR_DAY_H, n - 1); h++) track.push(siteAngles(data.ephemeris, start + h, frame))
    const dur = Math.round(Number(constraints.mission_duration_days) * 24)
    const metrics = dur <= n ? windowMetrics(series, 0, dur) : null
    // observer offset from the site centre in the site's east/north axes, metres
    const centre = data.points.find((p) => p.region === site.id && p.index === data.centreIndex)
    const home = siteFrame(site.lat, site.lon, centre?.elev_m ?? 0)
    const d = frame.pos.map((v, i) => (v - home.pos[i]) * 1000)
    const dot = (a: number[]) => a[0] * d[0] + a[1] * d[1] + a[2] * d[2]
    return { mask, series, track, metrics, evaluation: metrics && evaluate(metrics, obs.slopeDeg, constraints), east: dot(home.east), north: dot(home.north) }
  }, [data, site, plan, constraints])
  const day = useMemo(() => (observer ? dayOf(observer, viewStart) : null), [dayOf, observer, viewStart])
  /** F11: the plan's own day, kept alongside while an alternative is open. */
  const planDay = useMemo(() => (alt && plan ? dayOf(plan, planHour) : null), [dayOf, alt, plan, planHour])

  /** F14: the grid neighbours one 500 m step away in each compass direction (null at the grid edge). */
  const neighbours = useMemo(
    () => data && planPoint ? Object.fromEntries((['N', 'E', 'S', 'W'] as const).map((d) => [d, nudgeNeighbour(data.points, planPoint, d)])) : null,
    [data, planPoint],
  )

  const view = useMemo(() => {
    if (!data || !day) return null
    const { series } = day
    const t = Math.min(offset, day.track.length - 1)
    return {
      t, now: day.track[t],
      lit: series.frac[t],
      link: series.earth[t] === 1,
      power: series.frac[t] * Math.cos((series.sunEl[t] * Math.PI) / 180),
      sunChangeH: nextChange(series.litLeft, t),
      earthChangeH: nextChange(series.earthLeft, t),
      earthDistKm: data.ephemeris[(viewStart + t) * 7 + 6],
    }
  }, [data, day, viewStart, offset])

  // F12 playback: one lunar day in about 20 s, driven by the clock so the speed does not depend on frame rate
  const last = (day?.track.length ?? 1) - 1
  const playFrom = useRef(0)
  useEffect(() => {
    if (!playing) return
    const t0 = performance.now()
    let frame = requestAnimationFrame(function tick(now) {
      // the first frame's timestamp can be slightly before t0
      const o = playFrom.current + Math.floor((Math.max(0, now - t0) / 1000) * (LUNAR_DAY_H / PLAYBACK_S))
      setOffset(Math.min(last, o))
      if (o >= last) setPlaying(false)
      else frame = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(frame)
  }, [playing, last])
  const togglePlay = () => {
    playFrom.current = offset >= last ? 0 : offset
    setPlaying(!playing)
  }

  /** F14 nudge: move the plan one grid step (500 m) or one day; the summary tiles then show what changed. */
  const nudge = (dir: 'N' | 'E' | 'S' | 'W' | 'earlier' | 'later') => {
    if (!data || !planPoint || !day?.metrics) return
    const from = day.metrics
    if (dir === 'earlier' || dir === 'later') {
      const h = planHour + (dir === 'later' ? 24 : -24)
      if (h < 0 || h >= data.hours) return
      setPlanHour(h)
      setOffset(0)
      clearResults()
    } else {
      const next = neighbours?.[dir]
      if (!next) return
      selectSite(next.region, next.index === data.centreIndex ? null : next.index)
    }
    setSnapNote('')
    setNudgeFrom(from) // after clearResults, so this write wins
  }

  /** F13: what the app does as the tour reaches each step (step ids come from tour.json). */
  const tourStep = (id: string) => {
    if (id === 'pole-sun' && site?.terrain) {
      playFrom.current = 0
      setOffset(0)
      setPlaying(true)
    } else setPlaying(false)
  }

  const terrain = useMemo(() => data?.sites.filter((s) => s.terrain) ?? [], [data])
  const loadAll = useCallback(async () => {
    const loaded = Object.fromEntries(await Promise.all(terrain.map(async (s) => [s.id, await loadRegion(s.id)] as const)))
    setRegions((all) => ({ ...all, ...loaded }))
    return loaded
  }, [terrain])

  async function runFinder() {
    if (!data || !site || !plan || !planPoint) return
    setBusy(true)
    try {
      // candidates: the plan first, then its grid within the search radius, then the other curated sites
      const loaded = await loadAll()
      const radiusM = Number(constraints.search_radius_km) * 1000
      const candidates: Candidate[] = [plan]
      for (const p of data.points) {
        const own = p.region === site.id
        if (own ? p.index === planPoint.index || Math.hypot(p.x - planPoint.x, p.y - planPoint.y) > radiusM : p.index !== data.centreIndex) continue
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

  const openCell = useCallback((id: string, hour: number) => {
    selectSite(id)
    setPlanHour(hour)
    setSnapNote('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [selectSite])

  const guide = useMemo(
    () => ({ mode, glossary: new Map((data?.tour.glossary ?? []).map((g) => [g.term.toLowerCase(), g.definition])) }),
    [mode, data],
  )

  if (error) return <main><p role="alert">Something went wrong: {error}</p></main>
  if (!data || !site) return <main><p>Loading…</p></main>

  const date = (hour: number) => iso(data.startMs + hour * HOUR_MS).replace('T', ' ')
  const allLoaded = terrain.every((s) => regions[s.id])
  const submitCustom = (e: React.FormEvent) => {
    e.preventDefault()
    const [lat, lon] = [Number(custom.lat), Number(custom.lon)]
    if (custom.lat === '' || custom.lon === '' || !(lat >= -90 && lat <= -80) || !(lon >= -180 && lon <= 360))
      setSnapNote('Enter a latitude between −90 and −80 and an east longitude in degrees.')
    else locate(lat, lon)
  }
  return (
    <Guide.Provider value={guide}>
      <main className={mode}>
        <header>
          <div>
            <h1>Tranquility Base</h1>
            <p className="note">Lunar south-pole landing site navigator</p>
            {mode === 'explorer' && <button type="button" disabled={tour} onClick={() => setTour(true)}>Start tour</button>}
          </div>
          <div className="modes" role="group" aria-label="Mode">
            {(['planner', 'explorer'] as const).map((m) => (
              <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); if (m === 'planner') setTour(false) }}>{m === 'planner' ? 'Planner' : 'Explorer'}</button>
            ))}
          </div>
        </header>
        {data.synthetic && <p className="banner" role="status">Synthetic data: development fixtures, not real terrain or ephemeris.</p>}
        <div className="layout">
          <aside>
            <section className="panel" aria-label="Plan">
              <h2>Plan</h2>
              <label className="row">
                <span>Site</span>
                <select value={siteId} onChange={(e) => { selectSite(e.target.value); setSnapNote('') }}>
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
              <form className="custom" onSubmit={submitCustom}>
                <span>Custom coordinates</span>
                <div>
                  <input aria-label="Latitude" placeholder="Lat, e.g. −88.79" inputMode="decimal" value={custom.lat} onChange={(e) => setCustom({ ...custom, lat: e.target.value })} />
                  <input aria-label="Longitude (east)" placeholder="Lon °E" inputMode="decimal" value={custom.lon} onChange={(e) => setCustom({ ...custom, lon: e.target.value })} />
                  <button type="submit">Go</button>
                </div>
              </form>
              {snapNote && <p className="note snap" role="status" data-testid="snap-note">{snapNote}</p>}
              <p className="note">{site.mission} · {site.agency}<br />{(plan?.lat ?? site.lat).toFixed(3)}°, {(plan?.lon ?? site.lon).toFixed(3)}°E · {site.coord_source}</p>
              {mode === 'explorer' && site.blurb && <p className="note">{site.blurb}</p>}
            </section>
            <ConstraintPanel defs={data.constraintDefs} value={constraints} onChange={(c) => { setConstraints(c); clearResults() }} />
            <button type="button" className="primary" disabled={busy || !site.terrain || !plan} onClick={runFinder}>
              {busy ? 'Searching…' : 'Find alternatives'}
            </button>
            {!site.terrain && <p className="note">This site has no terrain (angle validation only), so the finder is off.</p>}
            <SiteMap data={data} site={site} point={planPoint} onPick={locate} />
          </aside>
          <div className="stage">
            {!view || !day || !observer ? <p>Loading terrain…</p> : (
              <>
                <div
                  className="status"
                  data-testid="view"
                  data-lat={observer.lat}
                  data-lon={observer.lon}
                  data-elev={observer.elevM}
                  data-point={observer.id}
                  data-hour={viewStart + view.t}
                  data-east={day.east.toFixed(0)}
                  data-north={day.north.toFixed(0)}
                >
                  <strong>{alt ? 'Alternative' : 'Plan'}: {observer.label}</strong>
                  <span>{date(viewStart)} UTC landing</span>
                  {day.evaluation ? <Chips evaluation={day.evaluation} /> : <span className="note">Mission window runs past 2035</span>}
                </div>
                {tour && <Tour steps={data.tour.steps} onStep={tourStep} onClose={() => { setTour(false); setPlaying(false) }} />}
                <div className="viewport">
                  {site.terrain
                    ? <Scene3D site={site} east={day.east} north={day.north} mask={day.mask} track={day.track} t={view.t}
                        sunFraction={view.lit} earthDistKm={view.earthDistKm} />
                    : <p className="note empty">No terrain for this site: it is used to validate Sun and Earth angles only, so the horizon below is flat.</p>}
                  <Hud sunEl={view.now.sunEl} earthEl={view.now.earthEl} lit={view.lit} link={view.link} power={view.power}
                    sunChangeH={view.sunChangeH} earthChangeH={view.earthChangeH} />
                </div>
                {site.heightmap && Math.max(Math.abs(day.east), Math.abs(day.north)) >= site.heightmap.span_m / 2 - 20 && (
                  <p className="note" data-testid="level-ground-note">
                    This point is outside the 5 × 5 km terrain patch around the site centre, so the 3D ground is drawn level.
                    The horizon ring, the panorama and every number still use this point's own terrain.
                  </p>
                )}
                <div className="scrub">
                  <button type="button" onClick={togglePlay} aria-pressed={playing} data-testid="play">
                    {playing ? 'Pause' : 'Play lunar day'}
                  </button>
                  <label>
                    <span>Lunar day scrubber · {date(viewStart + view.t)} UTC (landing +{view.t} h)</span>
                    <input type="range" min={0} max={last} value={view.t} onChange={(e) => { setPlaying(false); setOffset(Number(e.target.value)) }} />
                  </label>
                </div>
                {!alt && site.terrain && (
                  <div className="nudge" role="group" aria-label="Nudge the plan">
                    <span className="note">Nudge:</span>
                    {(['N', 'E', 'S', 'W'] as const).map((d) => (
                      <button key={d} type="button" disabled={!neighbours?.[d]} onClick={() => nudge(d)}>500 m {d}</button>
                    ))}
                    <button type="button" disabled={planHour < 24} onClick={() => nudge('earlier')}>1 day earlier</button>
                    <button type="button" disabled={planHour + 24 >= data.hours} onClick={() => nudge('later')}>1 day later</button>
                    {nudgeFrom && <span className="note" data-testid="nudge-note">Tiles show the change since the last nudge.</span>}
                  </div>
                )}
                {planDay && alt && plan
                  ? <Compare plan={{ label: plan.label, date: date(planHour), day: planDay }} alt={{ label: observer.label, date: date(viewStart), day }} t={view.t} />
                  : (
                    <>
                      {day.metrics && <Summary metrics={day.metrics} previous={nudgeFrom} />}
                      <Panorama mask={day.mask} track={day.track} t={view.t} />
                    </>
                  )}
                {found && <Results finder={found.finder} candidates={found.candidates} opened={opened} date={date}
                  onOpen={(i) => { setOpened(i); setOffset(0); setPlaying(false) }} />}
                {matrix && allLoaded
                  ? <Matrix data={data} regions={regions} start={planHour} constraints={constraints} selected={site.id} onOpen={openCell} />
                  : (
                    <button type="button" className="secondary" disabled={matrix} onClick={() => { setMatrix(true); loadAll().catch((e) => setError(String(e))) }}>
                      {matrix ? 'Loading every site…' : 'Show scenario matrix (all sites × landing dates)'}
                    </button>
                  )}
              </>
            )}
          </div>
        </div>
        <footer>
          Screening-grade results: 500 m search grid, 20 m terrain within 10 km and 80 m beyond. Not a
          mission design, hazard, power, thermal or link-budget tool. In the 3D view, ground detail finer
          than the 20 m terrain, the stars, the Sun's glare and Earth's surface are illustrative; every
          number comes from the engine. Data: NASA/JPL DE440, LRO LOLA (NASA GSFC PGDA).
        </footer>
      </main>
    </Guide.Provider>
  )
}
