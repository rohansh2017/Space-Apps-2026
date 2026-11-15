import { readFileSync } from 'node:fs'
import { maskAt, siteAngles, siteFrame, sunFraction } from '../../src/engine/engine'

const DATA = 'public/data/'
export const shot = (name: string) => ({ path: `tests/screenshots/${name}.png` })

/** The page opens on the Moon view; tests of the first-person ground view step onto the landing point first. */
export const standOnTheGround = async (page: import('@playwright/test').Page) => {
  await page.getByTestId('moon-stand').click()
  await page.getByTestId('moon-view').waitFor({ state: 'detached' })
}

/** The yearly ephemeris table holding an hour, and the hour's row in it. */
function ephemeris(hour: number): [Float32Array, number] {
  const year = 2026 + [8760, 8760, 8784, 8760, 8760, 8760, 8784, 8760, 8760, 8760].findIndex((_, i, a) => hour < a.slice(0, i + 1).reduce((x, y) => x + y, 0))
  const before = [8760, 8760, 8784, 8760, 8760, 8760, 8784, 8760, 8760, 8760].slice(0, year - 2026).reduce((x, y) => x + y, 0)
  const bytes = readFileSync(`${DATA}ephemeris/${year}.bin`)
  return [new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4), hour - before]
}

/** What the Moon view's bearing labels should say at pole level: the engine's angles for the pole itself. */
export function expectedPole(hour: number) {
  const a = siteAngles(...ephemeris(hour), siteFrame(-90, 0, 0))
  return { sun: `Sun ${a.sunEl.toFixed(2)}°`, earth: `Earth ${a.earthEl.toFixed(2)}°` }
}

/** Recompute what the HUD should show, straight from the data files, for the observer the page reports. */
export function expectedHud(view: Record<string, string>) {
  const a = siteAngles(...ephemeris(Number(view.hour)), siteFrame(Number(view.lat), Number(view.lon), Number(view.elev)))
  const [region, index] = view.point.split(':')
  const m = readFileSync(`${DATA}masks/${region}.bin`)
  const mask = new Uint16Array(m.buffer, m.byteOffset, m.byteLength / 2).subarray(Number(index) * 360, Number(index) * 360 + 360)
  const lit = sunFraction(a.sunEl, maskAt(mask, a.sunAz))
  return { sunEl: `${a.sunEl.toFixed(2)}°`, earthEl: `${a.earthEl.toFixed(2)}°`, lit: lit > 0 ? `Lit ${(lit * 100).toFixed(0)}%` : 'Dark' }
}

