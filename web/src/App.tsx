import { ChevronDown, ChevronUp, Info, ListOrdered, LayoutGrid, Link2, Map as MapIcon, Maximize2, Minimize2, PanelLeftClose, PanelLeftOpen, Pause, Play, Users } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Chips from './Chips'
import ConstraintPanel from './ConstraintPanel'
import type { Dataset, Region } from './data'
import { loadDataset, loadRegion } from './data'
import { horizonFacts } from './describe'
import HorizonText from './HorizonText'
import type { Constraints, Metrics } from './engine/engine'
import Drawer from './Drawer'
import { buildSeries, evaluate, maskAt, nextChange, nudgeNeighbour, siteAngles, siteFrame, skyMatrix, snapToGrid, windowMetrics } from './engine/engine'
import type { Candidate, FinderResult, Scored } from './engine/finder'
import { diffParts } from './engine/finder'
import type { FinderRequest } from './engine/finder.worker'
import type { Mode } from './guide'
import { Guide } from './guide'
import Hud from './Hud'
import Matrix from './Matrix'
import Panorama from './Panorama'
import { defaults } from './presets'
import Results from './Results'
import type { Room, RoomState } from './room'
import { connectRoom, newRoomId, roomIdFromUrl, roomLink, stateKey, validConstraints } from './room'
import Scene3D from './Scene3D'
import { decodeShare, encodeShare } from './share'
import SiteMap from './SiteMap'
import Tour from './Tour'
import type { TrayColumn } from './Tray'
import Tray, { TRAY_MAX } from './Tray'

const LUNAR_DAY_H = 708
const LOOKAHEAD_H = 720 // countdowns look this far past the scrubbed lunar day
const PLAYBACK_S = 20 // one lunar day of playback
const SNAP_LIMIT_M = 500 // a custom coordinate farther than this from every grid point is outside the regions
const HOUR_MS = 3_600_000
const START_HOUR = 7728 // 2026-11-19 00:00 UTC
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 16)

/**
 * Panel opens and closes morph instead of jumping (View Transitions, ~200 ms); instant where unsupported or with reduced
 * motion. `after` runs once the new layout is in the DOM (focus moves there).
 */
function smooth(update: () => void, after?: () => void) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown }
  const run = () => {
    flushSync(update)
    after?.()
  }
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) run()
  else doc.startViewTransition(run)
}

/** A scenario is a grid point and a landing hour; the plan, finder results, pins and the 3D view all use it. */
type ScenarioRef = { point: string; hour: number }
const refKey = (r: ScenarioRef) => `${r.point}@${r.hour}`

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
  const [found, setFound] = useState<{ finder: FinderResult; candidates: Candidate[]; constraints: Constraints } | null>(null)
  const [viewing, setViewing] = useState<ScenarioRef | null>(null) // the scenario in the 3D view; null = the plan
  const [pins, setPins] = useState<ScenarioRef[]>([]) // the compare tray, beside the plan
  const [pendingPin, setPendingPin] = useState<ScenarioRef | null>(null) // waiting for a free column
  const [matrix, setMatrix] = useState(false)
  const [drawer, setDrawer] = useState<'map' | 'matrix' | 'room' | null>(null)
  const [sideOpen, setSideOpen] = useState(true)
  const [fullscreen, setFullscreen] = useState(false)
  // collapsible panels; full screen collapses them for a cinematic view and restores them on exit
  const [hudOpen, setHudOpen] = useState(true)
  const [statusOpen, setStatusOpen] = useState(true)
  const [bandOpen, setBandOpen] = useState(true)
  const [resultsMin, setResultsMin] = useState(false) // the alternatives folded into their corner
  const [resultsFresh, setResultsFresh] = useState(false) // a search just finished: the list plays its entrance
  const resultsChip = useRef<HTMLButtonElement | null>(null)
  const [bandHeight, setBandHeight] = useState<number | null>(null) // null = sized by its content
  const [idle, setIdle] = useState(false) // full screen: chrome fades out while the pointer rests
  const beforeFullscreen = useRef<{ side: boolean; hud: boolean; status: boolean; band: boolean } | null>(null)
  const band = useRef<HTMLElement | null>(null)
  const mapButton = useRef<HTMLButtonElement | null>(null)
  const matrixButton = useRef<HTMLButtonElement | null>(null)
  const roomButton = useRef<HTMLButtonElement | null>(null)
  const viewStatus = useRef<HTMLDivElement | null>(null)
  const focusView = useRef(false)
  const about = useRef<HTMLDialogElement | null>(null)
  const [nudgeFrom, setNudgeFrom] = useState<Metrics | null>(null) // F14: metrics before the last nudge
  const [tour, setTour] = useState(false)
  const [busy, setBusy] = useState(false)
  const [stale, setStale] = useState(false) // constraints changed after the last search; results kept but marked out of date
  const [finderError, setFinderError] = useState('')
  const [loadError, setLoadError] = useState('') // one site's terrain failed to load; the rest of the app keeps working
  const [retry, setRetry] = useState(0)
  const [announce, setAnnounce] = useState('') // polite live region for screen readers
  const resultsHeading = useRef<HTMLHeadingElement | null>(null)
  const focusResults = useRef(false)
  const startTourButton = useRef<HTMLButtonElement | null>(null)
  const [roomId, setRoomId] = useState<string | null>(roomIdFromUrl)
  const [roomCount, setRoomCount] = useState(0)
  const room = useRef<Room | null>(null)
  const lastRoomKey = useRef('') // the state most recently sent or received, so nothing echoes
  const worker = useRef<Worker | null>(null)

  useEffect(() => {
    loadDataset().then((d) => {
      setData(d)
      // F17: a shared link restores site, point, landing time, changed constraints and mode
      const s = decodeShare(new URLSearchParams(window.location.search))
      const site = d.sites.find((x) => x.id === s.site) ?? d.sites[0]
      setSiteId(site.id)
      if (s.point !== undefined && s.point !== d.centreIndex && d.points.some((p) => p.region === site.id && p.index === s.point)) setPointIndex(s.point)
      const h = s.utc ? Math.round((Date.parse(s.utc) - d.startMs) / HOUR_MS) : NaN
      if (h >= 0 && h < d.hours) setPlanHour(h)
      setConstraints(validConstraints(d.constraintDefs, { ...defaults(d.constraintDefs), ...s.constraints }))
      if (s.mode) setMode(s.mode)
      const known = new Set(d.points.map((p) => p.id))
      setPins(s.pins.filter((p) => known.has(p.point) && p.hour >= 0 && p.hour < d.hours).slice(0, TRAY_MAX))
    }, (e) => setError(String(e)))
    return () => worker.current?.terminate()
  }, [])

  const site = data?.sites.find((s) => s.id === siteId)
  useEffect(() => {
    if (!site?.terrain) return
    let live = true
    loadRegion(site.id).then(
      (r) => live && setRegions((all) => ({ ...all, [site.id]: r })),
      (e) => live && setLoadError(`Couldn't load the terrain for ${site.name} (${e instanceof Error ? e.message : String(e)}).`),
    )
    return () => {
      live = false
    }
  }, [site, retry])

  useEffect(() => {
    if (found && focusResults.current) {
      focusResults.current = false
      resultsHeading.current?.focus()
    }
  }, [found])

  const clearResults = useCallback(() => {
    setFound(null)
    setViewing(null)
    setPlaying(false)
    setNudgeFrom(null)
    setStale(false)
  }, [])

  const selectSite = useCallback((id: string, index: number | null = null) => {
    setSiteId(id)
    setPointIndex(index)
    setOffset(0)
    setLoadError('')
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

  const pointById = useMemo(() => new Map((data?.points ?? []).map((p) => [p.id, p])), [data])
  /** The candidate for any grid point whose region is loaded; the plan keeps its own label and coordinates. */
  const candidateOf = useCallback((pointId: string): Candidate | null => {
    if (plan && pointId === plan.id) return plan
    const p = pointById.get(pointId)
    const r = p && regions[p.region]
    if (!data || !p || !r) return null
    return {
      id: p.id, label: data.sites.find((s) => s.id === p.region)!.name, lat: p.lat, lon: p.lon, elevM: p.elev_m,
      slopeDeg: r.slopes[p.index], mask: r.masks.subarray(p.index * 360, (p.index + 1) * 360),
    }
  }, [data, plan, pointById, regions])

  // pinned or viewed scenarios in another region load that region on demand
  useEffect(() => {
    const need = new Set([...pins, ...(viewing ? [viewing] : [])].map((r) => r.point.split(':')[0]).filter((id) => !regions[id]))
    for (const id of need) loadRegion(id).then((r) => setRegions((all) => ({ ...all, [id]: r })), () => undefined)
  }, [pins, viewing, regions])

  const viewed = viewing ? candidateOf(viewing.point) : null
  const observer = viewed ?? plan
  const viewStart = viewed && viewing ? viewing.hour : planHour
  const pinnedKeys = useMemo(() => new Set(pins.map(refKey)), [pins])

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
  /** The plan's own day: the compare tray's first column, whatever the 3D view shows. */
  const planDay = useMemo(() => (plan ? dayOf(plan, planHour) : null), [dayOf, plan, planHour])

  /** How a scenario differs from the plan, "5.0 km S · +16 days", from the engine's difference parts. */
  const differenceOf = useCallback((cand: Candidate, hour: number, metrics: Metrics | null) => {
    if (!plan) return ''
    const blank: Metrics = { sunlitPct: 0, longestLitH: 0, longestDarkH: 0, earthPct: 0, powerIndex: 0, meanElLit: null, landingOk: false }
    const scored = (start: number, m: Metrics | null): Scored => ({ candidate: 0, start, metrics: m ?? blank, evaluation: { passes: {}, fails: 0, score: 0 } })
    const d = diffParts(plan, scored(planHour, planDay?.metrics ?? null), cand, scored(hour, metrics))
    return `${d.where} · ${d.shift}`
  }, [plan, planHour, planDay])

  /** F11, generalised: the plan plus up to three pinned scenarios, each computed by the engine like the plan. */
  const pinnedDays = useMemo(() => pins.map((ref) => {
    const cand = candidateOf(ref.point)
    return { ref, cand, day: cand ? dayOf(cand, ref.hour) : null }
  }), [pins, candidateOf, dayOf])

  /** F15: sunlit % at every grid point of the selected region over the mission window from the landing hour. */
  const illumination = useMemo(() => {
    if (!data || !site?.terrain || !regions[site.id] || constraints.mission_duration_days === undefined) return null
    const r = regions[site.id]
    const dur = Math.round(Number(constraints.mission_duration_days) * 24)
    if (planHour + dur > data.hours) return null
    const out = new Float32Array(2 * data.centreIndex + 1) // n x n grid with the site at the middle index
    for (const p of data.points) {
      if (p.region !== site.id) continue
      const s = buildSeries(data.ephemeris, planHour, dur, siteFrame(p.lat, p.lon, p.elev_m), r.masks.subarray(p.index * 360, (p.index + 1) * 360), Number(constraints.min_earth_elevation_deg))
      out[p.index] = (s.cumFrac[dur] / dur) * 100
    }
    return out
  }, [data, site, regions, planHour, constraints])

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
      // the terrain the Sun and Earth have to clear, read from the same mask the engine uses
      sunHorizon: day.mask ? maskAt(day.mask, day.track[t].sunAz) : 0,
      earthHorizon: day.mask ? maskAt(day.mask, day.track[t].earthAz) : 0,
      // real star field for this observer and hour (stars are fixed in ICRF; the Moon turns under them)
      sky: observer ? skyMatrix(data.orientation, viewStart + t, siteFrame(observer.lat, observer.lon, observer.elevM)) : null,
    }
  }, [data, day, viewStart, offset, observer])

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
    setFinderError('')
    setAnnounce('Searching for alternatives…')
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
      const result = reply.result!
      setFound({ finder: result, candidates, constraints })
      setResultsMin(false)
      setResultsFresh(true)
      setViewing(null)
      setStale(false)
      const passing = result.results.filter((r) => r.evaluation.fails === 0).length
      setAnnounce(`Search finished: ${result.results.length} alternatives ranked, ${passing} meet every constraint.`)
      focusResults.current = true // the effect below moves focus once the results have rendered
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setFinderError(`The search failed (${message}). Your plan and constraints are unchanged; try again.`)
      setAnnounce('The search failed.')
    } finally {
      setBusy(false)
    }
  }

  // F17: keep the address bar shareable (the room id from F24 is kept)
  useEffect(() => {
    if (!data || !siteId) return
    const params = encodeShare(new URLSearchParams(window.location.search), {
      site: siteId, point: pointIndex, utc: new Date(data.startMs + planHour * HOUR_MS).toISOString(), constraints, defs: data.constraintDefs, mode, pins,
    })
    window.history.replaceState(null, '', `${window.location.pathname}?${params}`)
  }, [data, siteId, pointIndex, planHour, constraints, mode, pins])
  const [copied, setCopied] = useState(false)
  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href).catch(() => undefined)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  // F24 mission room: join when a room id is set; apply what arrives, send what changes here
  useEffect(() => {
    if (!data || !roomId) return
    const apply = (s: RoomState) => {
      const h = Math.round((Date.parse(s.utc) - data.startMs) / HOUR_MS)
      if (!data.sites.some((x) => x.id === s.site_id) || !(h >= 0 && h < data.hours)) return
      const point = s.point_index !== null && data.points.some((p) => p.region === s.site_id && p.index === s.point_index) ? s.point_index : null
      const constraints = validConstraints(data.constraintDefs, s.constraints)
      lastRoomKey.current = stateKey({ site_id: s.site_id, point_index: point, utc: s.utc, constraints })
      setSiteId(s.site_id)
      setPointIndex(point)
      setPlanHour(h)
      setConstraints(constraints)
      setSnapNote('')
      setFound(null)
      setViewing(null)
    }
    const r = connectRoom(roomId, apply, setRoomCount)
    room.current = r
    return () => {
      r.close()
      room.current = null
      setRoomCount(0)
    }
  }, [data, roomId])
  useEffect(() => {
    if (!data || !room.current || !siteId) return
    const state: RoomState = { site_id: siteId, point_index: pointIndex, utc: new Date(data.startMs + planHour * HOUR_MS).toISOString(), constraints }
    const key = stateKey(state)
    if (key === lastRoomKey.current) return
    lastRoomKey.current = key
    room.current.send(state)
  }, [data, roomId, siteId, pointIndex, planHour, constraints])
  const startRoom = () => {
    const id = newRoomId()
    window.history.replaceState(null, '', roomLink(id))
    setRoomId(id)
  }
  const leaveRoom = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState(null, '', url.toString())
    setRoomId(null)
  }

  const openCell = useCallback((id: string, hour: number) => {
    selectSite(id)
    setPlanHour(hour)
    setSnapNote('')
    setDrawer(null) // back to the view, so the opened cell is what you see
  }, [selectSite])

  // --- compare tray: pin, replace, view
  const togglePin = useCallback((ref: ScenarioRef) => {
    const key = refKey(ref)
    if (pins.some((p) => refKey(p) === key)) setPins(pins.filter((p) => refKey(p) !== key))
    else if (pins.length < TRAY_MAX) setPins([...pins, ref])
    else {
      setPendingPin(ref)
      setBandOpen(true) // the replace prompt lives in the tray
    }
  }, [pins])
  const showScenario = (ref: ScenarioRef | null) => {
    setViewing(ref)
    setOffset(0)
    setPlaying(false)
    focusView.current = true // the effect below moves focus to the view once it shows this scenario
  }
  useEffect(() => {
    if (focusView.current && viewStatus.current) {
      focusView.current = false
      viewStatus.current.focus()
    }
  }, [viewing, observer])
  const resultRef = (i: number): ScenarioRef | null => {
    if (!found) return null
    const r = found.finder.results[i]
    return { point: found.candidates[r.candidate].id, hour: r.start }
  }

  // --- full screen (projector demos); browsers without the API simply get no button
  const canFullscreen = typeof document !== 'undefined' && Boolean(document.fullscreenEnabled)
  useEffect(() => {
    const onChange = () => {
      const on = Boolean(document.fullscreenElement)
      setFullscreen(on)
      setIdle(false)
      const before = beforeFullscreen.current
      if (!on && before) { // back to the layout the user had
        beforeFullscreen.current = null
        smooth(() => {
          setSideOpen(before.side)
          setHudOpen(before.hud)
          setStatusOpen(before.status)
          setBandOpen(before.band)
        })
      }
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => undefined)
      return
    }
    beforeFullscreen.current = { side: sideOpen, hud: hudOpen, status: statusOpen, band: bandOpen }
    document.documentElement.requestFullscreen().then(() => {
      // cinematic: the terrain gets the screen; every panel is one click away
      smooth(() => {
        setSideOpen(false)
        setDrawer(null)
        setHudOpen(false)
        setStatusOpen(false)
        setBandOpen(false)
      })
    }, () => { beforeFullscreen.current = null })
  }
  // full screen: header and rail fade out after the pointer rests, and come back on any movement or key
  useEffect(() => {
    if (!fullscreen) return
    let timer = window.setTimeout(() => setIdle(true), 2500)
    const wake = () => {
      setIdle(false)
      window.clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), 2500)
    }
    window.addEventListener('pointermove', wake)
    window.addEventListener('keydown', wake)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [fullscreen])
  /** The band's top edge: drag, or arrow keys, to resize; double-click returns it to its natural height. */
  const bandLimits = () => [96, Math.max(160, window.innerHeight - 52 - 160)] as const
  const resizeBand = (e: React.PointerEvent<HTMLDivElement>) => {
    const box = band.current
    if (!box) return
    const bottom = box.getBoundingClientRect().bottom
    const [min, max] = bandLimits()
    const grip = e.currentTarget
    grip.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => setBandHeight(Math.round(Math.min(max, Math.max(min, bottom - ev.clientY))))
    const up = () => {
      grip.removeEventListener('pointermove', move)
      grip.removeEventListener('pointerup', up)
    }
    grip.addEventListener('pointermove', move)
    grip.addEventListener('pointerup', up)
  }
  const nudgeBand = (e: React.KeyboardEvent) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return
    e.preventDefault()
    const [min, max] = bandLimits()
    const now = bandHeight ?? band.current?.getBoundingClientRect().height ?? 300
    setBandHeight(Math.min(max, Math.max(min, Math.round(now + (e.key === 'ArrowUp' ? 24 : -24)))))
  }
  const closeDrawer = useCallback(() => smooth(() => setDrawer(null)), [])
  /** Make a pinned scenario the plan: it takes the plan's place, and the old plan takes its column in the tray. */
  const adoptPin = (key: string) => {
    const ref = pins.find((p) => refKey(p) === key)
    if (!data || !plan || !ref) return
    const [region, index] = [ref.point.split(':')[0], Number(ref.point.split(':')[1])]
    const old: ScenarioRef = { point: plan.id, hour: planHour }
    selectSite(region, index === data.centreIndex ? null : index) // also clears results, which described the old plan
    setPlanHour(ref.hour)
    setSnapNote('')
    setPins(pins.map((p) => (refKey(p) === key ? old : p)))
    setAnnounce('The pinned scenario is now the plan; the previous plan is pinned in its place.')
    focusView.current = true
  }
  /** Plan, Map and Scenario matrix share the left edge: one at a time, and all open and close the same way. */
  const openPanel = (which: 'plan' | 'map' | 'matrix') => {
    const isOpen = which === 'plan' ? sideOpen : drawer === which
    smooth(() => {
      setSideOpen(which === 'plan' && !isOpen)
      setDrawer(which === 'plan' || isOpen ? (drawer === 'room' ? 'room' : null) : which)
    })
    if (which === 'matrix' && !isOpen) loadMatrix()
  }
  const loadMatrix = () => {
    if (!matrix) {
      setMatrix(true)
      loadAll().catch((e) => {
        setMatrix(false)
        setLoadError(`Couldn't load every site for the matrix (${e instanceof Error ? e.message : String(e)}).`)
      })
    }
  }

  const guide = useMemo(
    () => ({ mode, glossary: new Map((data?.tour.glossary ?? []).map((g) => [g.term.toLowerCase(), g.definition])) }),
    [mode, data],
  )

  if (error)
    return (
      <main>
        <p role="alert">Tranquility Base couldn't load its data ({error}). Check the connection and reload.</p>
        <button type="button" onClick={() => window.location.reload()}>Reload</button>
      </main>
    )
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

  // the 3D view's scenario, named the way the results and the tray name it
  const openedIndex = found && viewing
    ? found.finder.results.findIndex((r) => refKey({ point: found.candidates[r.candidate].id, hour: r.start }) === refKey(viewing))
    : -1
  const viewTitle = viewed && day
    ? `${openedIndex >= 0 ? `#${openedIndex + 1} · ` : ''}${differenceOf(viewed, viewStart, day.metrics)}`
    : ''
  const trayPlan: TrayColumn = {
    key: 'plan', title: 'Plan', detail: plan?.label ?? site.name, when: `${date(planHour)} UTC`, viewing: !viewed,
    day: planDay,
  }
  const trayPins: TrayColumn[] = pinnedDays.map(({ ref, cand, day: d }) => ({
    key: refKey(ref),
    title: cand ? differenceOf(cand, ref.hour, d?.metrics ?? null) : 'Loading…',
    detail: cand?.label ?? ref.point.split(':')[0], when: `${date(ref.hour)} UTC`,
    viewing: Boolean(viewing && refKey(viewing) === refKey(ref)),
    day: d,
  }))
  const viewRef: ScenarioRef | null = viewing ?? (plan ? { point: plan.id, hour: planHour } : null)
  const levelGround = Boolean(day && site.heightmap && Math.max(Math.abs(day.east), Math.abs(day.north)) >= site.heightmap.span_m / 2 - 20)

  return (
    <Guide.Provider value={guide}>
      <div className={`app ${mode}${found ? ' has-results' : ''}${sideOpen ? '' : ' side-closed'}${fullscreen ? ' cinematic' : ''}${fullscreen && idle ? ' idle' : ''}`}>
        <div className="stage">
          {site.terrain && view && day && observer && (
            <Scene3D site={site} east={day.east} north={day.north} mask={day.mask} track={day.track} t={view.t}
              sunFraction={view.lit} earthDistKm={view.earthDistKm} sky={view.sky!} stars={data.stars}
              ridges={regions[observer.id.split(':')[0]]?.ridges ?? null} />
          )}
        </div>

        <header className="topbar">
          <div className="brand">
            <h1>Tranquility Base</h1>
            <span>Lunar south-pole landing site navigator</span>
          </div>
          <div className="topbar-actions">
            {mode === 'explorer' && <button type="button" ref={startTourButton} disabled={tour} onClick={() => setTour(true)}>Start tour</button>}
            {copied && <span className="note" role="status">Link copied</span>}
            <button type="button" onClick={copyLink}><Link2 size={15} aria-hidden="true" />Copy link</button>
            <button type="button" ref={roomButton} aria-expanded={drawer === 'room'} onClick={() => setDrawer(drawer === 'room' ? null : 'room')}>
              <Users size={15} aria-hidden="true" />Mission room
              {roomId && <span className={roomCount > 1 ? 'count live' : 'count'} data-testid="room-count">{roomCount} connected</span>}
            </button>
            {canFullscreen && (
              <button type="button" onClick={toggleFullscreen} aria-pressed={fullscreen}>
                {fullscreen ? <Minimize2 size={15} aria-hidden="true" /> : <Maximize2 size={15} aria-hidden="true" />}
                {fullscreen ? 'Exit full screen' : 'Full screen'}
              </button>
            )}
            <div className="modes" role="group" aria-label="Mode">
              {(['planner', 'explorer'] as const).map((m) => (
                <button key={m} type="button" aria-pressed={mode === m} onClick={() => { setMode(m); if (m === 'planner') setTour(false) }}>{m === 'planner' ? 'Planner' : 'Explorer'}</button>
              ))}
            </div>
          </div>
        </header>
        {data.synthetic && <p className="banner" role="status">Synthetic data: development fixtures, not real terrain or ephemeris.</p>}
        <p className="sr-only" aria-live="polite" data-testid="announcer">{announce}</p>

        <nav className="rail" aria-label="Tools">
          <button type="button" className="rail-button" aria-expanded={sideOpen} onClick={() => openPanel('plan')}>
            <PanelLeftOpen size={18} aria-hidden="true" /><span>Plan</span>
          </button>
          <button type="button" className="rail-button" ref={mapButton} aria-expanded={drawer === 'map'} onClick={() => openPanel('map')}>
            <MapIcon size={18} aria-hidden="true" /><span>Map</span>
          </button>
          <button type="button" className="rail-button" ref={matrixButton} aria-expanded={drawer === 'matrix'} onClick={() => openPanel('matrix')}>
            <LayoutGrid size={18} aria-hidden="true" /><span>Scenario matrix</span>
          </button>
        </nav>

        {sideOpen && (
          <aside className="side" aria-label="Plan and constraints">
            <div className="side-scroll">
              <section className="panel" aria-label="Plan">
                <div className="side-head">
                  <h2>Plan</h2>
                  <button type="button" className="icon-button" onClick={() => smooth(() => setSideOpen(false))} aria-label="Hide the plan panel">
                    <PanelLeftClose size={16} aria-hidden="true" />
                  </button>
                </div>
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
              <ConstraintPanel defs={data.constraintDefs} value={constraints} onChange={(c) => {
                setConstraints(c)
                setNudgeFrom(null)
                if (found && !stale) {
                  setStale(true)
                  setAnnounce('Constraints changed: the alternatives are out of date. Run the search again.')
                }
              }} />
            </div>
            <div className="side-foot">
              <button type="button" className="primary" disabled={busy || !site.terrain || !plan} aria-busy={busy} onClick={runFinder}>
                {busy ? 'Searching…' : 'Find alternatives'}
              </button>
              {finderError && <p className="inline-error" role="alert" data-testid="finder-error">{finderError}</p>}
            </div>
          </aside>
        )}

        <div className="over">
          {loadError ? (
            <div className="inline-error floating" role="alert" data-testid="load-error">
              <p>{loadError} Pick another site, or try again.</p>
              <button type="button" onClick={() => { setLoadError(''); setRetry((n) => n + 1) }}>Try again</button>
            </div>
          ) : !view || !day || !observer ? <p className="floating note">Loading terrain…</p> : (
            <>
              <div className="over-stack">
              <div
                className="status"
                ref={viewStatus}
                tabIndex={-1}
                data-testid="view"
                data-lat={observer.lat}
                data-lon={observer.lon}
                data-elev={observer.elevM}
                data-point={observer.id}
                data-hour={viewStart + view.t}
                data-east={day.east.toFixed(0)}
                data-north={day.north.toFixed(0)}
              >
                <div className="status-title">
                  <strong>{viewed ? `Alternative: ${viewTitle}` : `Plan: ${observer.label}`}</strong>
                  <button type="button" className="icon-button" onClick={() => smooth(() => setStatusOpen(!statusOpen))} aria-expanded={statusOpen}
                    aria-label={statusOpen ? 'Hide the landing time and pass/fail checks' : 'Show the landing time and pass/fail checks'} title={statusOpen ? 'Hide details' : 'Show details'}>
                    {statusOpen ? <ChevronUp size={15} aria-hidden="true" /> : <ChevronDown size={15} aria-hidden="true" />}
                  </button>
                  {statusOpen && <span>{viewed ? `${observer.label} · ` : ''}{date(viewStart)} UTC landing</span>}
                </div>
                {statusOpen && (day.evaluation ? <Chips evaluation={day.evaluation} constraints={constraints} /> : <span className="note">Mission window runs past 2035</span>)}
              </div>
              {tour && <Tour steps={data.tour.steps} onStep={tourStep} onClose={() => {
                setTour(false)
                setPlaying(false)
                requestAnimationFrame(() => startTourButton.current?.focus()) // the button is re-enabled on the next render
              }} />}
              </div>
              <Hud sunEl={view.now.sunEl} sunHorizon={view.sunHorizon} earthEl={view.now.earthEl} earthHorizon={view.earthHorizon}
                lit={view.lit} link={view.link} power={view.power}
                sunChangeH={view.sunChangeH} earthChangeH={view.earthChangeH} open={hudOpen} onToggle={() => smooth(() => setHudOpen(!hudOpen))} />
              <div className="stage-notes">
                {levelGround && (
                  <p className="tag" data-testid="level-ground-note">
                    Outside the 5 × 5 km terrain patch: the 3D ground is drawn level; the skyline, panorama and every number use this point's own terrain.
                  </p>
                )}
                {site.terrain && view.lit < 0.5 && (
                  <p className="tag" data-testid="fill-tag">In shadow · view brightened so the terrain stays visible</p>
                )}
              </div>
              {found && resultsMin && (
                <button type="button" className="results-chip" ref={resultsChip} aria-label={`Show the ${found.finder.results.length} alternatives`}
                  onClick={() => smooth(() => setResultsMin(false), () => resultsHeading.current?.focus())}>
                  <ListOrdered size={15} aria-hidden="true" />Alternatives <span className="count">{found.finder.results.length}</span>
                </button>
              )}
              {found && !resultsMin && <Results finder={found.finder} fresh={resultsFresh} onMinimize={() => smooth(() => { setResultsMin(true); setResultsFresh(false) }, () => resultsChip.current?.focus())} candidates={found.candidates} opened={openedIndex >= 0 ? openedIndex : null} date={date} stale={stale}
                headingRef={resultsHeading} onRerun={runFinder} busy={busy} constraints={found.constraints}
                pinned={pinnedKeys} onPin={(i) => { const r = resultRef(i); if (r) togglePin(r) }}
                onOpen={(i) => {
                  const r = i === null ? null : resultRef(i)
                  if (r && !pinnedKeys.has(refKey(r)) && pins.length < TRAY_MAX) setPins([...pins, r]) // opening also pins it, room permitting
                  showScenario(r)
                }} />}
            </>
          )}
        </div>

        {view && day && (
          <section className={`band${pins.length && bandOpen ? ' comparing' : ''}${bandOpen ? '' : ' collapsed'}`} aria-label="Timeline and comparison" ref={band}
            style={bandOpen && bandHeight !== null ? { height: bandHeight, maxHeight: 'none' } : undefined}>
            {bandOpen && (
              <div className="band-grip" role="separator" aria-orientation="horizontal" aria-label="Resize the timeline and comparison panel"
                aria-valuenow={bandHeight ?? undefined} aria-valuemin={bandLimits()[0]} aria-valuemax={bandLimits()[1]} tabIndex={0}
                title="Drag to resize · double-click to reset" onPointerDown={resizeBand} onKeyDown={nudgeBand} onDoubleClick={() => setBandHeight(null)} />
            )}
            <div className="band-time">
              <div className="scrub">
                <button type="button" onClick={togglePlay} aria-pressed={playing} data-testid="play">
                  {playing ? <Pause size={15} aria-hidden="true" /> : <Play size={15} aria-hidden="true" />}
                  {playing ? 'Pause' : 'Play lunar day'}
                </button>
                <label>
                  <span>Lunar day · {date(viewStart + view.t)} UTC <em>landing +{view.t} h</em></span>
                  <input type="range" min={0} max={last} value={view.t} aria-valuetext={`${date(viewStart + view.t)} UTC, landing plus ${view.t} hours`}
                    onChange={(e) => { setPlaying(false); setOffset(Number(e.target.value)) }} />
                </label>
              </div>
              {/* with pins, the tray needs the band: the plan's own skyline is in its column, the rest folds away */}
              {bandOpen && (() => {
                const detail = (
                  <>
              {!viewed && site.terrain && (
                <div className="nudge" role="group" aria-label="Nudge the plan">
                  <span className="note">Nudge the plan</span>
                  {(['N', 'E', 'S', 'W'] as const).map((d) => (
                    <button key={d} type="button" disabled={!neighbours?.[d]} onClick={() => nudge(d)}>500 m {d}</button>
                  ))}
                  <button type="button" disabled={planHour < 24} onClick={() => nudge('earlier')}>1 day earlier</button>
                  <button type="button" disabled={planHour + 24 >= data.hours} onClick={() => nudge('later')}>1 day later</button>
                  {nudgeFrom && <span className="note" data-testid="nudge-note">The plan's tiles show the change since the last nudge.</span>}
                </div>
              )}
              <Panorama mask={day.mask} track={day.track} t={view.t} width={1080} height={210} />
              <HorizonText facts={horizonFacts(day.mask, day.series, day.track, view.t, Math.round(Number(constraints.mission_duration_days) * 24))} />
                  </>
                )
                return pins.length ? <details className="band-more"><summary>Nudge, skyline and horizon description</summary>{detail}</details> : detail
              })()}
            </div>
            {bandOpen && <Tray plan={trayPlan} pinned={trayPins} t={view.t} constraints={constraints} previous={nudgeFrom}
              pending={pendingPin ? { title: (() => { const c = candidateOf(pendingPin.point); return c ? differenceOf(c, pendingPin.hour, null) : 'this scenario' })() } : null}
              onView={(key) => showScenario(key === null ? null : pins.find((p) => refKey(p) === key) ?? null)}
              onAdopt={adoptPin}
              onUnpin={(key) => { setPins(pins.filter((p) => refKey(p) !== key)); if (viewing && refKey(viewing) === key) showScenario(null) }}
              onReplace={(key) => { if (pendingPin) setPins(pins.map((p) => (refKey(p) === key ? pendingPin : p))); setPendingPin(null) }}
              onCancelPending={() => setPendingPin(null)}
              onPinView={() => { if (viewRef) togglePin(viewRef) }}
              canPinView={Boolean(viewRef && !pinnedKeys.has(refKey(viewRef)))} />}
          </section>
        )}
        {view && day && (
          // one tab on the band's top edge, in the same place open or closed: up to raise the panel, down to drop it
          <button type="button" className="band-tab" onClick={() => smooth(() => setBandOpen(!bandOpen))} aria-expanded={bandOpen}
            aria-label={bandOpen ? 'Collapse the timeline and comparison panel' : 'Expand the timeline and comparison panel'} title={bandOpen ? 'Drop the panel' : 'Raise the panel'}>
            {bandOpen ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronUp size={16} aria-hidden="true" />}
          </button>
        )}

        <footer className="footline">
          <span>Screening grade only: 500 m search grid on LOLA terrain. Not a mission design, hazard, power, thermal or link-budget tool.</span>
          <button type="button" className="link-button" onClick={() => about.current?.showModal()}><Info size={14} aria-hidden="true" />About the data</button>
        </footer>

        <dialog ref={about} className="about" aria-labelledby="about-title" onClick={(e) => { if (e.target === e.currentTarget) about.current?.close() }}>
          <div className="about-body">
            <h2 id="about-title">About the data</h2>
            <p>
              Screening-grade results: a 500 m search grid, 20 m terrain within 10 km and 80 m beyond. Not a mission design,
              landing hazard, power, thermal or communications link-budget tool. Every number on screen comes from the engine, never
              from the 3D renderer.
            </p>
            <h3>Data</h3>
            <p>NASA/JPL DE440 ephemeris and NAIF lunar kernels; LRO LOLA terrain from NASA GSFC PGDA (20 m and 80 m polar DEMs, 5 m site DEMs); the Yale Bright Star Catalogue (BSC5).</p>
            <h3>What the 3D view takes from data</h3>
            <p>Terrain relief (5 m where PGDA has a site DEM, otherwise 20 m); the distant ranges' outline and their lighting from the LOLA slope at each crest; the Sun's and Earth's positions; the stars' positions and brightness for this site and hour.</p>
            <h3>What it invents, for legibility</h3>
            <ul>
              <li>Soil texture finer than about 1.5 m, and the rock texture on the distant ranges.</li>
              <li>The ground colour, the Sun's glare and Earth's surface pattern.</li>
              <li>Star colours, approximated from each star's B−V index.</li>
              <li>Outside the 5 × 5 km terrain patch, level ground at the point's own elevation; the skyline and every number still use its real terrain.</li>
              <li>When the Sun is hidden, a faint overhead fill so the terrain stays visible. Real lunar shadow is black.</li>
            </ul>
            <form method="dialog"><button type="submit" className="primary">Close</button></form>
          </div>
        </dialog>

        {drawer === 'map' && (
          <Drawer title="Map" side="left" onClose={closeDrawer} returnFocus={mapButton} testId="drawer-map">
            <SiteMap data={data} site={site} point={planPoint} illumination={illumination} onPick={locate} />
            {/* invariant 9: a map click snaps to the grid and says how far; the Plan panel is closed while the map is open */}
            {snapNote && <p className="note snap" role="status" data-testid="snap-note">{snapNote}</p>}
          </Drawer>
        )}
        {drawer === 'matrix' && (
          <Drawer title="Scenario matrix" side="wide" onClose={closeDrawer} returnFocus={matrixButton} testId="drawer-matrix">
            {matrix && allLoaded
              ? <Matrix data={data} regions={regions} start={planHour} constraints={constraints} selected={site.id} onOpen={openCell} />
              : <p className="note">Loading every site…</p>}
          </Drawer>
        )}
        {drawer === 'room' && (
          <Drawer title="Mission room" side="right" onClose={closeDrawer} returnFocus={roomButton} testId="drawer-room">
            <div className="room">
              {roomId ? (
                <>
                  <div className="room-row">
                    <span>{roomCount} in this room</span>
                    <button type="button" onClick={leaveRoom}>Leave room</button>
                  </div>
                  <input readOnly value={roomLink(roomId)} aria-label="Room link" data-testid="room-link" onFocus={(e) => e.target.select()} />
                  <p className="note">Share the link: everyone in the room sees the same site, date and constraints. Each browser still runs the engine itself.</p>
                </>
              ) : (
                <>
                  <button type="button" className="primary" onClick={startRoom}>Start mission room</button>
                  <p className="note">Share one plan with teammates in real time.</p>
                </>
              )}
            </div>
          </Drawer>
        )}
      </div>
    </Guide.Provider>
  )
}
