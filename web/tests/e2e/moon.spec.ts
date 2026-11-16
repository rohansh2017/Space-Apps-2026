import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { expandPanels, expectedHud, expectedPole, shot } from './hud'

const observer = (page: Page) => page.getByTestId('view').evaluate((el: HTMLElement) => ({ ...el.dataset }) as Record<string, string>)
const centreOf = async (page: Page, testId: string) => {
  const b = (await page.getByTestId(testId).boundingBox())!
  return [b.x + b.width / 2, b.y + b.height / 2] as const
}
/** The marker has stopped moving: the fly-down is over. */
const settled = async (page: Page) => {
  await expect(page.getByTestId('moon-marker')).toBeVisible()
  let last = [-1, -1] as readonly number[]
  await expect.poll(async () => {
    const now = await centreOf(page, 'moon-marker')
    const still = Math.hypot(now[0] - last[0], now[1] - last[1]) < 0.5
    last = now
    return still
  }, { intervals: [250] }).toBe(true)
}

// F25: the page opens on the Moon; a pin flies down to its site's grid; the landing point is dragged; "Stand here" hands off to the ground view.
test('Moon view: pins with engine verdicts, fly-down, drag the landing point, stand on it', async ({ page }) => {
  test.slow()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const moon = page.getByTestId('moon-view')
  const view = page.getByTestId('view')
  await expect(moon).toBeVisible()
  await expandPanels(page) // the first view is quiet (D54, team): open the card, the HUD and the tray, with the plan in it
  await expect(moon).toHaveAttribute('data-level', 'pole')
  await expect(view).toContainText('Plan: Shackleton rim') // the status card and HUD stay
  await expect(page.locator('.stage canvas[data-engine]')).toHaveCount(1) // one WebGL context

  // every curated site is a pin; solid or hollow is the engine's verdict for the planned landing hour
  await expect(page.locator('button.moon-pin')).toHaveCount(9)
  const rim = page.getByTestId('moon-pin-change7-shackleton-rim')
  await expect(rim).toHaveAttribute('data-verdict', 'pass') // the plan's own site: the status card shows no failing chip
  await expect(view.locator('.chip.fail')).toHaveCount(0)
  await expect(rim).toHaveAttribute('aria-label', /solid pin, meets every constraint .* landing 2026-11-19 00:00 UTC/)
  const haworth = page.getByTestId('moon-pin-haworth')
  await expect(haworth).toHaveAttribute('data-verdict', 'fail')
  await expect(haworth).toHaveAttribute('aria-label', /hollow pin, fails \d of 5 constraints/)
  await haworth.hover()
  await expect(haworth.locator('.moon-tip')).toContainText(/Sunlit \d+\.\d% · Earth \d+\.\d% · longest dark \d+ h/)
  await expect(haworth.locator('.moon-tip')).toContainText('Fails: ')
  await page.mouse.move(5, 5)

  // bearing labels at pole level are the engine's angles for the pole; scrubbing moves the Sun
  const hour = Number((await observer(page)).hour)
  await expect(page.getByTestId('moon-sun')).toHaveText(expectedPole(hour).sun)
  await expect(page.getByTestId('moon-earth')).toHaveText(expectedPole(hour).earth)
  await page.getByRole('slider', { name: /^Lunar day/ }).fill('200')
  await expect(page.getByTestId('moon-sun')).toHaveText(expectedPole(hour + 200).sun)
  await page.getByRole('slider', { name: /^Lunar day/ }).fill('0')
  await page.waitForTimeout(800)
  await page.screenshot(shot('18-moon-pole'))

  // a pin flies down onto its site's search grid
  await rim.click()
  await expect(moon).toHaveAttribute('data-level', 'site')
  await expect(page.getByTestId('moon-back')).toBeVisible()
  const marker = page.getByTestId('moon-marker')
  await expect(marker).toBeVisible()
  await expect(marker).toHaveAttribute('data-point', 'change7-shackleton-rim:220')
  await settled(page)
  // once zoomed in, the bearings start at the landing point and read what the HUD reads
  await expect(page.getByTestId('moon-sun')).toHaveText(`Sun ${await page.getByTestId('hud-sun-el').textContent()}`)
  await expect(page.getByTestId('moon-legend')).toContainText('meets every constraint') // Verdict is the default layer
  await page.screenshot(shot('19-moon-region'))

  // hovering a grid dot shows that point's engine numbers
  const [mx, my] = await centreOf(page, 'moon-marker')
  await page.mouse.move(mx - 60, my + 45)
  await expect(page.getByTestId('moon-dot-tip')).toContainText(/Sunlit \d+\.\d% · Earth \d+\.\d% · longest dark \d+ h/)

  // dragging the marker beats the orbit controls, snaps to the grid, and moves the plan live
  await page.mouse.move(mx, my)
  await page.mouse.down()
  await page.mouse.move(mx + 60, my - 20, { steps: 6 })
  await page.mouse.move(mx + 110, my - 45, { steps: 6 })
  await page.mouse.up()
  await expect(page.getByTestId('snap-note')).toContainText(/Snapped \d+ m to the nearest grid point/)
  expect(Number((await page.getByTestId('snap-note').textContent())!.match(/Snapped (\d+) m/)![1])).toBeLessThanOrEqual(360) // half a grid diagonal
  await expect(page).toHaveURL(/point=\d+/)
  const dragged = await observer(page)
  expect(dragged.point).toMatch(/^change7-shackleton-rim:\d+$/)
  expect(dragged.point).not.toBe('change7-shackleton-rim:220')
  await expect(marker).toHaveAttribute('data-point', dragged.point)
  await expect(view).toContainText('custom point')
  expect({ sunEl: await page.getByTestId('hud-sun-el').textContent(), earthEl: await page.getByTestId('hud-earth-el').textContent(), lit: await page.getByTestId('hud-lit').textContent() })
    .toEqual(expectedHud(dragged))
  // the camera did not orbit, and the marker sits under the pointer (within one grid step on screen)
  const [nx, ny] = await centreOf(page, 'moon-marker')
  expect(Math.hypot(nx - (mx + 110), ny - (my - 45))).toBeLessThan(30)

  // a click on a dot moves the marker there
  await page.mouse.click(nx - 120, ny + 30)
  await expect.poll(async () => (await observer(page)).point).not.toBe(dragged.point)
  const clicked = await observer(page)
  await expect(marker).toHaveAttribute('data-point', clicked.point)
  await settled(page) // the marker has been drawn at its new point

  // far outside the grid: the nearest edge point is kept, and the note says so
  const [cx, cy] = await centreOf(page, 'moon-marker')
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await page.mouse.move(cx + 200, cy, { steps: 5 })
  await page.mouse.move(cx + 520, cy + 10, { steps: 8 })
  await page.mouse.up()
  await expect(page.getByTestId('snap-note')).toContainText('Outside the 10 km search grid: kept the nearest edge point')
  expect((await observer(page)).point).not.toBe(clicked.point)

  // keyboard: arrows nudge one grid step, like the nudge buttons; Enter stands on the point
  await marker.focus()
  const before = await observer(page)
  await page.keyboard.press('ArrowRight') // east; the drag ended on the grid's edge, where not every direction has a neighbour
  await expect.poll(async () => (await observer(page)).point).not.toBe(before.point)
  const nudged = await observer(page)
  expect(Number(nudged.east)).toBeGreaterThan(Number(before.east) + 300)
  await expect(page.getByTestId('nudge-note')).toBeVisible()
  await page.keyboard.press('Enter')
  await expect(moon).toHaveCount(0)
  await expect(page.locator('.stage > .scene canvas[data-engine]')).toHaveCount(1) // the ground view took the stage
  await expect(view).toBeFocused()
  expect((await observer(page)).point).toBe(nudged.point)

  // back from the tray; the grid can also be coloured by verdict; then out to the pole
  await page.getByRole('button', { name: 'Pin this view' }).click() // pins work from any view, any point (D59)
  await page.getByTestId('tray-pin').first().getByRole('button', { name: /^Show .* on the Moon$/ }).click()
  await expect(moon).toHaveAttribute('data-level', 'site')
  await page.getByRole('button', { name: 'Verdict' }).click()
  await expect(page.getByTestId('moon-legend')).toContainText('meets every constraint')
  await page.getByTestId('moon-back').click()
  await expect(moon).toHaveAttribute('data-level', 'pole')
  await expect(marker).toHaveCount(0)
  await page.getByTestId('moon-stand').click() // "Stand here" from the bar
  await expect(moon).toHaveCount(0)
  await page.getByRole('button', { name: 'Moon', exact: true }).click() // and the rail brings the Moon back
  await expect(moon).toBeVisible()
  expect(errors).toEqual([])
})

test('Moon view: the whole Moon has LOLA relief, fetched only after the polar map', async ({ page }) => {
  const order: string[] = []
  page.on('request', (r) => { const f = r.url().split('/data/basemaps/')[1]; if (f) order.push(f) })
  await page.goto('/')
  await expect(page.getByTestId('moon-view')).toBeVisible()
  // with the relief (D67) the whole Moon is shaded from LOLA heights, and globe.png is not fetched
  await expect.poll(() => order.includes('relief/globe.png'), { timeout: 20_000 }).toBe(true)
  expect(order.indexOf('pole.png')).toBeLessThan(order.indexOf('relief/globe.png'))
  expect(order).not.toContain('globe.png')
  // the BSC5 stars, turned for the hour, behind the Moon at both levels (D61)
  await expect(page.getByTestId('moon-view')).toHaveAttribute('data-stars', /^9\d{3}$/)
  // the Pole button at pole level brings the camera home after an orbit
  const at = async () => { const b = (await page.getByTestId('moon-pin-haworth').boundingBox())!; return [b.x, b.y] }
  await expect(page.getByTestId('moon-pin-haworth')).toBeVisible()
  const home = await at()
  const box = (await page.getByTestId('moon-view').boundingBox())!
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.6, { steps: 8 })
  await page.mouse.up()
  await expect.poll(async () => Math.hypot(...(await at()).map((v, i) => v - home[i]))).toBeGreaterThan(30)
  await page.getByTestId('moon-back').click()
  await expect.poll(async () => Math.hypot(...(await at()).map((v, i) => v - home[i])), { timeout: 5000 }).toBeLessThan(2)
  // flying to a site fetches its context relief (D62, D67); its 5 m heightmap waits until the camera comes close
  const fetched: string[] = []
  page.on('request', (r) => fetched.push(r.url()))
  const context = page.waitForRequest((r) => r.url().includes('/data/basemaps/relief/context/connecting-ridge.png'))
  await page.getByTestId('moon-pin-connecting-ridge').click()
  await context
  await page.waitForTimeout(1500)
  expect(fetched.some((u) => u.includes('/data/heightmaps/connecting-ridge.png'))).toBe(false)
  const heightmap = page.waitForRequest((r) => r.url().includes('/data/heightmaps/connecting-ridge.png'))
  const view = (await page.getByTestId('moon-view').boundingBox())!
  await page.mouse.move(view.x + view.width / 2, view.y + view.height / 3)
  for (let i = 0; i < 30; i++) await page.mouse.wheel(0, -300)
  await heightmap
  await expect(page.getByTestId('moon-view')).toHaveAttribute('data-stars', /^9\d{3}$/) // the stars stay
})

// D67/D68: LOLA relief raised in 3D after the polar map, a height slider, and the Topo layer with its legend
test('Moon view: relief in 3D, the Height slider and the Topo layer', async ({ page }) => {
  test.slow()
  const order: string[] = []
  page.on('request', (r) => { const f = r.url().split('/data/basemaps/')[1]; if (f) order.push(f) })
  await page.goto('/')
  const moon = page.getByTestId('moon-view')
  await expect(moon).toHaveAttribute('data-relief', 'loaded', { timeout: 20_000 })
  expect(order.indexOf('pole.png')).toBeLessThan(order.indexOf('relief/pole.png'))
  await expect.poll(() => order.includes('relief/globe.png'), { timeout: 20_000 }).toBe(true)
  expect(order.indexOf('relief/pole.png')).toBeLessThan(order.indexOf('relief/globe.png'))
  await expect(page.getByTestId('moon-note')).toContainText('Real Sun on LOLA terrain')

  // Topo: legend with the level's contour spacing, and the LOLA height under the pointer
  await expect(page.getByTestId('moon-topo-legend')).toHaveCount(0)
  await page.getByTestId('moon-topo').click()
  await expect(moon).toHaveAttribute('data-topo', 'on')
  const legend = page.getByTestId('moon-topo-legend')
  await expect(legend).toContainText('contours every 1000 m, heavy every 5,000 m')
  const box = (await moon.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height * 0.55)
  await expect(page.getByTestId('moon-topo-height')).toHaveText(/^−?[\d,]+ m under the pointer$/)

  // flown down: the site's context relief, finer contours; the landing point is picked on the raised ground
  const ctx = page.waitForRequest((r) => r.url().includes('/data/basemaps/relief/context/connecting-ridge.png'))
  await page.getByTestId('moon-pin-connecting-ridge').click()
  await ctx
  await expect(legend).toContainText('contours every 100 m (20 m on the 5 km site patch)')
  const marker = page.getByTestId('moon-marker')
  for (const exag of ['1', '5']) {
    await page.getByTestId('moon-exag').fill(exag)
    await expect(moon).toHaveAttribute('data-exag', exag)
    await page.waitForTimeout(600)
    const id = await marker.getAttribute('data-point')
    const m = (await marker.boundingBox())!
    // a click on the marker's own spot (not a drag) lands on the same grid point: the pick follows the drawn terrain
    await page.mouse.click(m.x + m.width / 2 + 2, m.y + m.height / 2 + 2)
    await page.waitForTimeout(300)
    await expect(marker).toHaveAttribute('data-point', id!)
  }
  await page.getByTestId('moon-topo').click()
  await expect(legend).toHaveCount(0)
})

test('Moon view: reduced motion jumps instead of flying; a link to an exact point opens on the ground', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.getByTestId('moon-pin-connecting-ridge').click()
  await expect(page.getByTestId('view')).toContainText('Plan: Connecting Ridge')
  await expect(page.getByTestId('moon-marker')).toBeVisible() // placed by the first frame
  await expect(page.getByRole('slider', { name: /^Lunar day/ })).toBeVisible() // the band arrives with the terrain and resizes the stage
  await page.waitForTimeout(200) // well inside the 1.1 s flight, had there been one
  const a = await centreOf(page, 'moon-marker') // already in place: no flight to wait for
  await page.waitForTimeout(400)
  const b = await centreOf(page, 'moon-marker')
  expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeLessThan(0.5)

  await page.goto('/?site=connecting-ridge&point=100')
  await expect(page.getByTestId('view')).toContainText('custom point')
  await expect(page.getByTestId('moon-view')).toHaveCount(0)
  await expect(page.locator('.stage > .scene')).toBeVisible()
})

test('Moon view: finder results and tray pins are marked, and a pinned scenario can be shown on the Moon', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await expect(page.getByTestId('moon-pin-change7-shackleton-rim')).toHaveAttribute('data-verdict', 'fail') // the slipped date fails here too
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await expect(page.getByTestId('result').first()).toBeVisible()
  await expect(page.getByTestId('moon-view')).toBeVisible() // searching keeps the Moon on the stage
  await page.getByRole('button', { name: 'Pin #1 to the compare tray' }).click()
  const pin = page.getByTestId('tray-pin')
  await expect(pin.locator('.tray-letter')).toHaveText('A')
  await pin.getByRole('button', { name: /^Show .* on the Moon$/ }).click()
  await expect(page.getByTestId('moon-view')).toHaveAttribute('data-level', 'site')
  await expect(page.getByTestId('view')).toContainText('Alternative:')
  await expect(page.getByTestId('moon-marker')).toHaveAttribute('aria-label', /^Landing point of the alternative on show/)
  await expect(pin).toContainText('On the Moon view')
  // an alternative's point is fixed: a drag orbits instead of moving it
  const before = await page.getByTestId('view').getAttribute('data-point')
  const [x, y] = await centreOf(page, 'moon-marker')
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 80, y + 10, { steps: 5 })
  await page.mouse.up()
  expect(await page.getByTestId('view').getAttribute('data-point')).toBe(before)
  await page.waitForTimeout(600)
  await page.screenshot(shot('20-moon-alternative'))
})

test('D76: the other sites stand on the skyline in 3D, one click stands there; Sites hides them there, never in the Moon view', async ({ page }) => {
  test.setTimeout(150_000) // looking around the 3D view on software WebGL is slow
  await page.goto('/')
  await expect(page.getByTestId('moon-view')).toBeVisible()
  await page.getByTestId('moon-pin-malapert-massif').hover()
  await page.getByTestId('moon-stand-malapert-massif').click()
  await expect(page.getByTestId('view')).toContainText('Plan: Malapert Massif')
  // every terrain site but the one stood on, each with its great-circle distance
  const pins = page.locator('[data-testid^="ground-pin-"]')
  await expect(pins).toHaveCount(8)
  await expect(page.getByTestId('ground-pin-malapert-massif')).toHaveCount(0)
  await expect(page.getByTestId('ground-pin-im2-mons-mouton')).toContainText(/Mons Mouton · \d+ km/)
  // look around until one is in front of the camera; clicking it stands there, still in 3D
  const shown = page.locator('[data-testid^="ground-pin-"]:visible').first()
  const box = (await page.locator('.stage').boundingBox())!
  for (let turn = 0; turn < 7 && !(await shown.isVisible()); turn++) {
    // about 55 degrees a drag; software WebGL takes seconds a frame here
    await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height * 0.5, { steps: 2 })
    await page.mouse.up()
    await page.waitForTimeout(500)
  }
  await expect(shown).toBeVisible()
  const name = (await shown.getAttribute('aria-label'))!.split(',')[0]
  await shown.dispatchEvent('click') // the camera's damping keeps it drifting for seconds on software WebGL
  await expect(page.getByTestId('view')).toContainText(`Plan: ${name}`)
  await expect(page.getByTestId('stage-pole')).toBeVisible()
  // Sites off: no pins on the skyline; the Moon view still shows every site's pin; the choice survives a reload
  await page.getByTestId('stage-sites').click()
  await expect(page.getByTestId('stage-sites')).toHaveAttribute('aria-pressed', 'false')
  await expect(pins).toHaveCount(0)
  await page.getByTestId('stage-pole').click()
  await expect(page.locator('.moon-pin-wrap')).toHaveCount(9)
  await expect(page.getByTestId('moon-sites')).toHaveCount(0)
  await page.reload()
  await expect(page.locator('.moon-pin-wrap')).toHaveCount(9)
  await page.getByTestId('moon-stand').click()
  await expect(page.getByTestId('stage-sites')).toHaveAttribute('aria-pressed', 'false')
  await expect(pins).toHaveCount(0)
  await page.getByTestId('stage-sites').click()
  await expect(pins).toHaveCount(8)
})
