import { readFileSync } from 'node:fs'
import { maskAt, siteAngles, siteFrame, sunFraction } from '../../src/engine/engine'

const DATA = 'public/data/'
export const shot = (name: string) => ({ path: `tests/screenshots/${name}.png` })

/** Recompute what the HUD should show, straight from the data files, for the observer the page reports. */
export function expectedHud(view: Record<string, string>) {
  const hour = Number(view.hour)
  const year = 2026 + [8760, 8760, 8784, 8760, 8760, 8760, 8784, 8760, 8760, 8760].findIndex((_, i, a) => hour < a.slice(0, i + 1).reduce((x, y) => x + y, 0))
  const before = [8760, 8760, 8784, 8760, 8760, 8760, 8784, 8760, 8760, 8760].slice(0, year - 2026).reduce((x, y) => x + y, 0)
  const bytes = readFileSync(`${DATA}ephemeris/${year}.bin`)
  const table = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
  const a = siteAngles(table, hour - before, siteFrame(Number(view.lat), Number(view.lon), Number(view.elev)))
  const [region, index] = view.point.split(':')
  const m = readFileSync(`${DATA}masks/${region}.bin`)
  const mask = new Uint16Array(m.buffer, m.byteOffset, m.byteLength / 2).subarray(Number(index) * 360, Number(index) * 360 + 360)
  const lit = sunFraction(a.sunEl, maskAt(mask, a.sunAz))
  return { sunEl: `${a.sunEl.toFixed(2)}°`, earthEl: `${a.earthEl.toFixed(2)}°`, lit: lit > 0 ? `Lit ${(lit * 100).toFixed(0)}%` : 'Dark' }
}


/** The app opens quiet (card, HUD and band folded); tests that read them unfold all three first. */
export async function expandPanels(page: import('@playwright/test').Page) {
  await page.getByTestId('view').waitFor()
  for (const name of [/^Show the landing time/, /^Show the Sun and Earth details$/, /^Expand the timeline and comparison panel$/]) {
    const b = page.getByRole('button', { name })
    if (await b.count()) await b.click()
  }
  await page.getByTestId('tray').waitFor()
}
