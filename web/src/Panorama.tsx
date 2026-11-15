import { useEffect, useRef } from 'react'
import type { Angles } from './engine/engine'
import { maskAt } from './engine/engine'

// Colours are the world's: sunlight gold, Earth blue, regolith terrain, deep-shadow sky. Tests read them by value.
const PANO = { sky: '#07080a', terrain: '#57534d', ridge: '#8a857c', sun: '#f0b955', earth: '#5fa8ff', grid: '#e0d8c8' }
const EL_MIN = -8
const EL_MAX = 16

interface Props {
  mask: Uint16Array | null // 360 raw bins, or null for a site without terrain
  track: Angles[] // one entry per hour of the selected window
  t: number // current hour: the track up to here is the trail
  width?: number // canvas pixels; CSS scales it
  height?: number
  compact?: boolean // tray thumbnails: no labels, thinner marks
  label?: string // accessible name
}

/**
 * The signature view: the unrolled 360° skyline with the Sun's and Earth's tracks. A track is solid where the body
 * clears the terrain, ghosted where the ridge hides it, and ticked where it meets the ridgeline (sunset, sunrise).
 */
export default function Panorama({ mask, track, t, width = 1080, height = 300, compact = false, label }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const W = width
    const H = height
    const x = (az: number) => (az / 360) * W
    const y = (el: number) => H - ((el - EL_MIN) / (EL_MAX - EL_MIN)) * H
    const ridge = (az: number) => (mask ? maskAt(mask, az) : 0)
    const g = ref.current!.getContext('2d')!
    g.fillStyle = PANO.sky
    g.fillRect(0, 0, W, H)

    // elevation grid: hairlines every 4°, the true horizon (0°) a little stronger
    for (let el = EL_MIN + 4; el < EL_MAX; el += 4) {
      g.globalAlpha = el === 0 ? 0.22 : 0.07
      g.fillStyle = PANO.grid
      g.fillRect(0, Math.round(y(el)), W, 1)
    }
    g.globalAlpha = 1
    if (!compact) {
      const px = Math.round(12 * (W / (ref.current!.clientWidth || W))) // CSS scales the canvas; keep labels about 12 px on screen
      g.font = `600 ${px}px "Public Sans", system-ui, sans-serif`
      g.fillStyle = '#9a948a'
      g.textAlign = 'right' // elevations on the right edge, compass points on the left: they never collide
      for (let el = EL_MIN + 4; el < EL_MAX; el += 4) g.fillText(`${el}°`, W - 6, y(el) - 4)
      g.textAlign = 'left'
      ;['N', 'E', 'S', 'W'].forEach((d, i) => g.fillText(d, x(i * 90) + 6, px + 4))
    }

    // terrain first, so tracks behind the ridge can be drawn over it as ghosts
    g.beginPath()
    g.moveTo(0, H)
    for (let px = 0; px <= W; px++) g.lineTo(px, y(ridge((px / W) * 360)))
    g.lineTo(W, H)
    g.fillStyle = PANO.terrain
    g.fill()
    g.beginPath()
    for (let px = 0; px <= W; px++) g[px ? 'lineTo' : 'moveTo'](px, y(ridge((px / W) * 360)))
    g.strokeStyle = PANO.ridge
    g.lineWidth = compact ? 1 : 1.5
    g.stroke()

    const dot = compact ? 2 : 3
    const trail = compact ? 3 : 4
    const draw = (color: string, az: (a: Angles) => number, el: (a: Angles) => number) => {
      let wasUp: boolean | null = null
      track.forEach((a, i) => {
        const up = el(a) > ridge(az(a))
        const size = i <= t ? trail : dot
        g.globalAlpha = up ? 1 : 0.32
        g.fillStyle = color
        g.fillRect(Math.round(x(az(a)) - size / 2), Math.round(y(el(a)) - size / 2), size, size)
        if (wasUp !== null && up !== wasUp && !compact) {
          // the body meets the ridgeline here: a short tick on the skyline
          g.globalAlpha = 1
          g.fillRect(Math.round(x(az(a))) - 1, Math.round(y(ridge(az(a)))) - 7, 2, 14)
        }
        wasUp = up
      })
      g.globalAlpha = 1
    }
    draw(PANO.sun, (a) => a.sunAz, (a) => a.sunEl)
    draw(PANO.earth, (a) => a.earthAz, (a) => a.earthEl)

    const now = track[Math.min(t, track.length - 1)]
    const marker = (az: number, el: number, color: string, r: number) => {
      g.beginPath()
      g.arc(x(az), y(el), r, 0, 2 * Math.PI)
      g.fillStyle = color
      g.fill()
      g.lineWidth = 2
      g.strokeStyle = PANO.sky
      g.stroke()
    }
    if (now) {
      marker(now.earthAz, now.earthEl, PANO.earth, compact ? 4 : 6)
      marker(now.sunAz, now.sunEl, PANO.sun, compact ? 4.5 : 7)
    }
  }, [mask, track, t, width, height, compact])
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      className={compact ? 'panorama compact' : 'panorama'}
      role="img"
      aria-label={label ?? 'Horizon panorama: terrain skyline with the Sun track (gold) and Earth track (blue); dimmed where the ridge hides them'}
    />
  )
}
