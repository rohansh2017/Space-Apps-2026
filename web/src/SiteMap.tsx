import { memo, useEffect, useRef, useState } from 'react'
import type { Dataset, Point, Site } from './data'
import { dataUrl } from './data'
import { latLonToXY, xyToLatLon } from './engine/engine'
import { SUN_RAMP, colour } from './ramp'

const PX = 560 // canvas pixels; CSS scales it to the panel width

function useImage(file: string | undefined): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  useEffect(() => {
    if (!file) return
    let live = true
    const i = new Image()
    i.onload = () => live && setImg(i)
    i.src = dataUrl(file)
    return () => {
      live = false
    }
  }, [file])
  return file && img?.src.endsWith(file) ? img : null
}

interface MapProps {
  label: string
  testid: string
  image: HTMLImageElement | null
  cx: number // stereographic centre of the view, metres
  cy: number
  half: number // half-width of the view, metres
  draw: (g: CanvasRenderingContext2D, px: (x: number, y: number) => [number, number]) => void
  onPick: (lat: number, lon: number) => void
}

/** A square map in stereographic axes (+y up). Clicking reports the latitude and longitude under the pointer. */
function MapCanvas({ label, testid, image, cx, cy, half, draw, onPick }: MapProps) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [hover, setHover] = useState('')
  useEffect(() => {
    const g = ref.current!.getContext('2d')!
    g.fillStyle = '#0a0c11'
    g.fillRect(0, 0, PX, PX)
    if (image) g.drawImage(image, 0, 0, PX, PX)
    draw(g, (x, y) => [((x - cx) / (2 * half) + 0.5) * PX, (0.5 - (y - cy) / (2 * half)) * PX])
  }, [image, cx, cy, half, draw])
  const at = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return xyToLatLon(cx + ((e.clientX - r.left) / r.width - 0.5) * 2 * half, cy + (0.5 - (e.clientY - r.top) / r.height) * 2 * half)
  }
  return (
    <figure className="map">
      <canvas
        ref={ref} width={PX} height={PX} role="img" aria-label={label} data-testid={testid}
        onMouseMove={(e) => { const [lat, lon] = at(e); setHover(`${lat.toFixed(3)}°, ${lon.toFixed(2)}°E`) }}
        onMouseLeave={() => setHover('')}
        onClick={(e) => onPick(...at(e))}
      />
      <figcaption className="note">{label}{hover && <span className="map-hover"> · {hover}</span>}</figcaption>
    </figure>
  )
}

interface Props {
  data: Dataset
  site: Site
  point: Point | null // the plan's grid point; null for sites without terrain
  illumination: Float32Array | null // F15: sunlit % per grid point (indexed by point index) over the mission window
  onPick: (lat: number, lon: number) => void
}

/** F1 map click: the whole south polar cap with every curated site, and the selected site's search grid. */
function SiteMap({ data, site, point, illumination, onPick }: Props) {
  const pole = useImage(data.basemap.pole.file)
  const region = useImage(site.terrain ? data.basemap.regions.files[site.id] : undefined)
  const centre = site.terrain ? latLonToXY(site.lat, site.lon) : null
  const gridPoints = data.points.filter((p) => p.region === site.id)

  const drawPole = (g: CanvasRenderingContext2D, px: (x: number, y: number) => [number, number]) => {
    g.lineWidth = 1.5
    g.font = '18px system-ui'
    for (const lat of [-85, -88]) {
      const [x0, y0] = px(0, 0)
      const [x1] = px(latLonToXY(lat, 90)[0], 0)
      g.strokeStyle = 'rgb(255 255 255 / 22%)'
      g.beginPath()
      g.arc(x0, y0, x1 - x0, 0, 2 * Math.PI)
      g.stroke()
      g.fillStyle = 'rgb(255 255 255 / 55%)'
      g.fillText(`${-lat}°S`, x0 + 4, y0 - (x1 - x0) - 4)
    }
    for (const s of data.sites) {
      if (!s.terrain) continue
      const [x, y] = px(...latLonToXY(s.lat, s.lon))
      const selected = s.id === site.id
      g.beginPath()
      g.arc(x, y, selected ? 9 : 6, 0, 2 * Math.PI)
      g.fillStyle = selected ? '#ece8e1' : '#9a948a'
      g.fill()
      g.lineWidth = 2
      g.strokeStyle = '#0a0c11'
      g.stroke()
    }
  }

  const drawRegion = (g: CanvasRenderingContext2D, px: (x: number, y: number) => [number, number]) => {
    if (illumination) {
      // one 500 m cell per grid point, hillshade showing through; a 2 px gap keeps cells apart
      const cell = (500 / (2 * data.basemap.regions.half_width_m)) * PX
      g.globalAlpha = 0.78
      for (const p of gridPoints) {
        const [x, y] = px(p.x, p.y)
        g.fillStyle = colour(illumination[p.index], 100, SUN_RAMP)
        g.fillRect(x - cell / 2 + 1, y - cell / 2 + 1, cell - 2, cell - 2)
      }
      g.globalAlpha = 1
    } else {
      g.fillStyle = 'rgb(255 255 255 / 45%)'
      for (const p of gridPoints) {
        const [x, y] = px(p.x, p.y)
        g.fillRect(x - 1.5, y - 1.5, 3, 3)
      }
    }
    if (point) {
      const [x, y] = px(point.x, point.y)
      g.beginPath()
      g.arc(x, y, 10, 0, 2 * Math.PI)
      g.lineWidth = 3
      g.strokeStyle = '#ece8e1'
      g.stroke()
    }
    // north (away from the pole) at this site, as an arrow in the corner
    const lon = (site.lon * Math.PI) / 180
    const [dx, dy] = [Math.sin(lon), -Math.cos(lon)]
    g.strokeStyle = g.fillStyle = '#e8eaf0'
    g.lineWidth = 2.5
    g.beginPath()
    g.moveTo(50 - dx * 24, 50 - dy * 24)
    g.lineTo(50 + dx * 24, 50 + dy * 24)
    g.stroke()
    g.beginPath()
    g.arc(50 + dx * 24, 50 + dy * 24, 5, 0, 2 * Math.PI)
    g.fill()
    g.font = '18px system-ui'
    g.fillText('N', 50 + dx * 38 - 6, 50 + dy * 38 + 6)
  }

  return (
    <section aria-label="Site map">
      <MapCanvas label="South polar cap, 80–90°S: click to pick a point" testid="map-pole" image={pole} cx={0} cy={0}
        half={data.basemap.pole.half_width_m} draw={drawPole} onPick={onPick} />
      {centre && (
        <MapCanvas label={illumination ? `${site.name}: sunlit % per grid point over the mission window` : `${site.name}: 500 m search grid`}
          testid="map-region" image={region} cx={centre[0]} cy={centre[1]} half={data.basemap.regions.half_width_m} draw={drawRegion} onPick={onPick} />
      )}
      {centre && illumination && (
        <p className="note legend-row" data-testid="illumination-legend">
          Sunlit <span className="legend" aria-hidden="true">0% <i style={{ background: `linear-gradient(90deg, ${SUN_RAMP.join(',')})` }} /> 100%</span> of the mission window, per 500 m cell
        </p>
      )}
      <p className="note">LOLA hillshade with illustrative lighting. Clicks snap to the nearest precomputed grid point.</p>
    </section>
  )
}

export default memo(SiteMap)
