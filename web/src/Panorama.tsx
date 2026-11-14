import { useEffect, useRef } from 'react'
import type { Angles } from './engine/engine'
import { maskAt } from './engine/engine'

const W = 1080
const H = 300
const EL_MIN = -8
const EL_MAX = 16
const x = (az: number) => (az / 360) * W
const y = (el: number) => H - ((el - EL_MIN) / (EL_MAX - EL_MIN)) * H

interface Props {
  mask: Uint16Array | null // 360 raw bins, or null for a site without terrain
  track: Angles[] // one entry per hour of the selected window
  now: Angles
}

/** Unrolled 360 degree horizon with the Sun and Earth tracks over the selected window. */
export default function Panorama({ mask, track, now }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const g = ref.current!.getContext('2d')!
    g.fillStyle = '#05070c'
    g.fillRect(0, 0, W, H)

    g.font = '11px system-ui'
    g.strokeStyle = '#232a3a'
    g.fillStyle = '#7d879c'
    for (let el = EL_MIN + 4; el < EL_MAX; el += 4) {
      g.beginPath()
      g.moveTo(0, y(el))
      g.lineTo(W, y(el))
      g.stroke()
      g.fillText(`${el}°`, 4, y(el) - 3)
    }
    ;['N', 'E', 'S', 'W'].forEach((label, i) => g.fillText(label, x(i * 90) + 4, 12))

    const dots = (color: string, az: (a: Angles) => number, el: (a: Angles) => number) => {
      g.fillStyle = color
      for (const a of track) g.fillRect(x(az(a)) - 1, y(el(a)) - 1, 2, 2)
    }
    dots('#e8c34a', (a) => a.sunAz, (a) => a.sunEl)
    dots('#5fa8ff', (a) => a.earthAz, (a) => a.earthEl)

    const marker = (az: number, el: number, color: string, r: number) => {
      g.beginPath()
      g.arc(x(az), y(el), r, 0, 2 * Math.PI)
      g.fillStyle = color
      g.fill()
      g.strokeStyle = '#fff'
      g.stroke()
    }
    marker(now.sunAz, now.sunEl, '#ffd84a', 6)
    marker(now.earthAz, now.earthEl, '#3d8bff', 5)

    // terrain drawn last so bodies behind the ridge line are hidden, as they are in the sky
    g.beginPath()
    g.moveTo(0, H)
    for (let px = 0; px <= W; px++) g.lineTo(px, y(mask ? maskAt(mask, (px / W) * 360) : 0))
    g.lineTo(W, H)
    g.fillStyle = '#4a4f5c'
    g.fill()
  }, [mask, track, now])
  return (
    <canvas
      ref={ref}
      width={W}
      height={H}
      className="panorama"
      role="img"
      aria-label="Horizon panorama: terrain silhouette with Sun (yellow) and Earth (blue) tracks"
    />
  )
}
