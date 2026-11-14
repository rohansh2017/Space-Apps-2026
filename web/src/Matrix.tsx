import { memo, useMemo, useState } from 'react'
import type { Dataset, Region } from './data'
import type { Constraints } from './engine/engine'
import { buildSeries, evaluate, siteFrame, windowMetrics } from './engine/engine'

// Sequential single-hue ramp for a dark surface: low values recede toward the panel, high values are light.
const RAMP = ['#0d366b', '#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb']
const colour = (v: number, max: number) => RAMP[Math.min(RAMP.length - 1, Math.max(0, Math.round((v / max) * (RAMP.length - 1))))]

const METRICS = {
  sunlit: { name: 'Sunlit %', unit: '%' },
  dark: { name: 'Longest dark run', unit: ' h' },
  earth: { name: 'Earth visible %', unit: '%' },
  met: { name: 'Constraints met', unit: '' },
} as const
type MetricId = keyof typeof METRICS

const SPANS = { '60 days, daily': { cols: 60, stepH: 24 }, '1 year, weekly': { cols: 53, stepH: 168 } } as const
type SpanId = keyof typeof SPANS

interface Props {
  data: Dataset
  regions: Record<string, Region> // every terrain region, loaded
  start: number // ephemeris row of the first column (the planned landing hour)
  constraints: Constraints
  selected: string // site id of the plan
  onOpen: (siteId: string, hour: number) => void
}

/** F10 scenario matrix: curated sites as rows, landing dates as columns, cells coloured by one metric. */
function Matrix({ data, regions, start, constraints, selected, onOpen }: Props) {
  const [metric, setMetric] = useState<MetricId>('sunlit')
  const [span, setSpan] = useState<SpanId>('60 days, daily')
  const [hover, setHover] = useState('')
  const { cols, stepH } = SPANS[span]
  const dur = Math.round(Number(constraints.mission_duration_days) * 24)

  const rows = useMemo(() => {
    const n = Math.min((cols - 1) * stepH + dur, data.hours - start)
    return data.sites.filter((s) => s.terrain && regions[s.id]).map((site) => {
      const i = data.centreIndex
      const p = data.points.find((q) => q.region === site.id && q.index === i)!
      const r = regions[site.id]
      const series = buildSeries(data.ephemeris, start, n, siteFrame(p.lat, p.lon, p.elev_m), r.masks.subarray(i * 360, (i + 1) * 360),
        Number(constraints.min_earth_elevation_deg))
      const cells = Array.from({ length: cols }, (_, c) => {
        if (c * stepH + dur > n) return null // the mission window would run past the ephemeris
        const m = windowMetrics(series, c * stepH, dur)
        const e = evaluate(m, r.slopes[i], constraints)
        const checked = Object.keys(e.passes).length
        return { sunlit: m.sunlitPct, dark: m.longestDarkH, earth: m.earthPct, met: checked - e.fails, checked }
      })
      return { site, cells }
    })
  }, [data, regions, start, constraints, cols, stepH, dur])

  const checked = rows[0]?.cells[0]?.checked ?? 5
  const max = metric === 'dark' ? dur : metric === 'met' ? checked : 100
  const day = (c: number) => new Date(data.startMs + (start + c * stepH) * 3_600_000).toISOString().slice(0, 10)
  const value = (v: number) => `${metric === 'met' ? `${v} of ${checked}` : v.toFixed(0)}${METRICS[metric].unit}`
  const labelEvery = Math.ceil(cols / 6)

  return (
    <section className="panel" aria-label="Scenario matrix">
      <div className="matrix-head">
        <h2>Scenario matrix</h2>
        <label>Colour by{' '}
          <select value={metric} onChange={(e) => setMetric(e.target.value as MetricId)} aria-label="Matrix metric">
            {Object.entries(METRICS).map(([id, m]) => <option key={id} value={id}>{m.name}</option>)}
          </select>
        </label>
        <label>Span{' '}
          <select value={span} onChange={(e) => setSpan(e.target.value as SpanId)} aria-label="Matrix span">
            {Object.keys(SPANS).map((s) => <option key={s}>{s}</option>)}
          </select>
        </label>
        <span className="legend" aria-hidden="true">
          0 <i style={{ background: `linear-gradient(90deg, ${RAMP.join(',')})` }} /> {max}{METRICS[metric].unit}
        </span>
      </div>
      <div className="matrix-scroll">
        <table className="matrix" data-testid="matrix">
          <thead>
            <tr>
              <th scope="col">Landing date (UTC)</th>
              {Array.from({ length: cols }, (_, c) => <th key={c} scope="col">{c % labelEvery === 0 && <span>{day(c).slice(5)}</span>}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map(({ site, cells }) => (
              <tr key={site.id}>
                <th scope="row" className={site.id === selected ? 'sel' : ''}>{site.name}</th>
                {cells.map((cell, c) => cell === null ? <td key={c} /> : (
                  <td key={c}>
                    <button
                      type="button"
                      style={{ background: colour(cell[metric], max) }}
                      className={site.id === selected && c === 0 ? 'plan' : ''}
                      aria-label={`${site.name}, ${day(c)}: ${METRICS[metric].name} ${value(cell[metric])}`}
                      onMouseEnter={(e) => setHover(e.currentTarget.ariaLabel ?? '')}
                      onFocus={(e) => setHover(e.currentTarget.ariaLabel ?? '')}
                      onClick={() => onOpen(site.id, start + c * stepH)}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="note" data-testid="matrix-hover">
        {hover || `Each cell is a ${Number(constraints.mission_duration_days)}-day mission landing at that site's centre on that date. Click a cell to open it in 3D.`}
      </p>
    </section>
  )
}

export default memo(Matrix)
