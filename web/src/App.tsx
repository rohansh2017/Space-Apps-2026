import { useEffect, useMemo, useState } from 'react'
import type { Dataset } from './data'
import { loadDataset, loadMasks } from './data'
import { earthVisible, maskAt, siteAngles, siteFrame, sunFraction } from './engine/engine'
import Panorama from './Panorama'
import Scene3D from './Scene3D'

const LUNAR_DAY_H = 708
const HOUR_MS = 3_600_000
const START_HOUR = 7752 // 2026-11-20 00:00 UTC
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16)

export default function App() {
  const [data, setData] = useState<Dataset | null>(null)
  const [error, setError] = useState('')
  const [siteId, setSiteId] = useState('')
  const [dayStart, setDayStart] = useState(START_HOUR) // first hour of the scrubbed lunar day
  const [offset, setOffset] = useState(0)
  const [masks, setMasks] = useState<{ region: string; raw: Uint16Array } | null>(null)

  useEffect(() => {
    loadDataset().then((d) => {
      setData(d)
      setSiteId(d.sites[0].id)
    }, (e) => setError(String(e)))
  }, [])

  const site = data?.sites.find((s) => s.id === siteId)
  useEffect(() => {
    if (!site?.terrain) return
    let live = true
    loadMasks(site.id).then((raw) => live && setMasks({ region: site.id, raw }), (e) => setError(String(e)))
    return () => {
      live = false
    }
  }, [site])

  const view = useMemo(() => {
    if (!data || !site) return null
    const centre = data.points.find((p) => p.region === site.id && p.index === data.centreIndex)
    const frame = siteFrame(site.lat, site.lon, centre?.elev_m ?? 0)
    const ready = site.terrain && masks?.region === site.id
    const mask = ready ? masks.raw.subarray(data.centreIndex * 360, (data.centreIndex + 1) * 360) : null
    const last = Math.min(dayStart + LUNAR_DAY_H, data.hours - 1)
    const track = []
    for (let h = dayStart; h <= last; h++) track.push(siteAngles(data.ephemeris, h, frame))
    const now = track[Math.min(offset, track.length - 1)]
    const sunMask = mask ? maskAt(mask, now.sunAz) : 0
    const earthMask = mask ? maskAt(mask, now.earthAz) : 0
    return {
      mask, track, now,
      lit: sunFraction(now.sunEl, sunMask),
      link: earthVisible(now.earthEl, earthMask),
      loading: site.terrain && !ready,
    }
  }, [data, site, masks, dayStart, offset])

  if (error) return <main><p role="alert">Could not load data: {error}</p></main>
  if (!data || !site || !view) return <main><p>Loading…</p></main>

  const nowMs = data.startMs + (dayStart + offset) * HOUR_MS
  return (
    <main>
      <h1>Tranquility Base</h1>
      {data.synthetic && <p className="banner" role="status">Synthetic data: development fixtures, not real terrain or ephemeris.</p>}
      <div className="controls">
        <label>
          Site
          <select value={siteId} onChange={(e) => setSiteId(e.target.value)}>
            {data.sites.map((s) => <option key={s.id} value={s.id}>{s.name}{s.approximate ? ' (approx.)' : ''}</option>)}
          </select>
        </label>
        <label>
          Date and time (UTC)
          <input
            type="datetime-local"
            step={3600}
            value={iso(nowMs)}
            min={iso(data.startMs)}
            max={iso(data.startMs + (data.hours - 1) * HOUR_MS)}
            onChange={(e) => {
              const h = Math.round((Date.parse(e.target.value + 'Z') - data.startMs) / HOUR_MS)
              if (Number.isFinite(h) && h >= 0 && h < data.hours) {
                setDayStart(h)
                setOffset(0)
              }
            }}
          />
        </label>
        <label className="scrub">
          Lunar day scrubber: +{offset} h
          <input type="range" min={0} max={view.track.length - 1} value={offset} onChange={(e) => setOffset(Number(e.target.value))} />
        </label>
      </div>
      <p className="readout" data-testid="readout">
        {iso(nowMs).replace('T', ' ')} UTC · Sun el {view.now.sunEl.toFixed(2)}° az {view.now.sunAz.toFixed(1)}° ·{' '}
        Sun visible {(view.lit * 100).toFixed(0)}% · Earth el {view.now.earthEl.toFixed(2)}° az {view.now.earthAz.toFixed(1)}° ·{' '}
        Earth link {view.link ? 'yes' : 'no'}
        {view.loading && ' · loading terrain…'}
      </p>
      <p className="note">{site.mission} · {site.agency} · {site.lat.toFixed(3)}°, {site.lon.toFixed(3)}°E · source: {site.coord_source}</p>
      {site.terrain
        ? <Scene3D site={site} sunAz={view.now.sunAz} sunEl={view.now.sunEl} sunFraction={view.lit} />
        : <p className="note">No terrain for this site: it is used to validate Sun and Earth angles only, so the horizon below is flat.</p>}
      <Panorama mask={view.mask} track={view.track} now={view.now} />
      <footer>
        Screening-grade results: 500 m search grid, 20 m terrain within 10 km and 80 m beyond. Not a
        mission design, hazard, power, thermal or link-budget tool. Data: NASA/JPL DE440, LRO LOLA
        (NASA GSFC PGDA).
      </footer>
    </main>
  )
}
