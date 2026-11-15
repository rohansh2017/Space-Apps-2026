import { expect, test } from '@playwright/test'
import { expandPanels, expectedHud, shot } from './hud'

const hudOf = async (page: import('@playwright/test').Page) => ({
  sunEl: await page.getByTestId('hud-sun-el').textContent(),
  earthEl: await page.getByTestId('hud-earth-el').textContent(),
  lit: await page.getByTestId('hud-lit').textContent(),
})
const observer = (page: import('@playwright/test').Page) =>
  page.getByTestId('view').evaluate((el: HTMLElement) => ({ ...el.dataset }) as Record<string, string>)

test('custom coordinates and map clicks snap to the grid and show the snap distance', async ({ page }) => {
  test.slow() // 15 s alone; under the full parallel suite it can pass 30 s
  await page.goto('/')
  await expandPanels(page)
  const view = page.getByTestId('view')
  await expect(view).toContainText('Plan: Shackleton rim')

  // a coordinate about 300 m from the site: snaps to a neighbouring grid point
  await page.getByLabel('Latitude').fill('-88.79')
  await page.getByLabel('Longitude (east)').fill('123.9')
  await page.getByRole('button', { name: 'Go' }).click()
  await expect(page.getByTestId('snap-note')).toContainText(/Snapped \d+ m to the nearest grid point/)
  const snapped = Number((await page.getByTestId('snap-note').textContent())!.match(/Snapped (\d+) m/)![1])
  expect(snapped).toBeLessThanOrEqual(500)
  await expect(view).toContainText('custom point')
  const o = await observer(page)
  expect(o.point).toMatch(/^change7-shackleton-rim:\d+$/)
  expect(o.point).not.toBe('change7-shackleton-rim:220')
  expect(await hudOf(page)).toEqual(expectedHud(o))

  // far from every region: a clear message, and the plan does not move
  await page.getByLabel('Latitude').fill('-85')
  await page.getByLabel('Longitude (east)').fill('100')
  await page.getByRole('button', { name: 'Go' }).click()
  await expect(page.getByTestId('snap-note')).toContainText('outside the precomputed regions')
  expect((await observer(page)).point).toBe(o.point)

  // a click on the region map picks another grid point
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await page.getByTestId('map-region').click({ position: { x: 60, y: 200 } })
  await expect(page.getByTestId('snap-note')).toContainText('Snapped')
  const clicked = await observer(page)
  expect(clicked.point).not.toBe(o.point)
  expect(await hudOf(page)).toEqual(expectedHud(clicked))

  // a click on a site marker of the polar map switches site (Connecting Ridge is 60 km from the pole)
  const box = (await page.getByTestId('map-pole').boundingBox())!
  const half = 304000
  const r = 2 * 1737400 * Math.tan(((90 - 89.463) * Math.PI) / 360)
  const [x, y] = [r * Math.sin((-137.49 * Math.PI) / 180), r * Math.cos((-137.49 * Math.PI) / 180)]
  await page.getByTestId('map-pole').click({ position: { x: (x / (2 * half) + 0.5) * box.width, y: (0.5 - y / (2 * half)) * box.height } })
  await expect(view).toContainText('Connecting Ridge')
  await page.waitForTimeout(1200)
  await page.screenshot({ ...shot('6-map-and-custom-point'), fullPage: true })
})

test('Explorer mode adds plain-English labels and glossary tooltips', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('summary')).toContainText('Sunlit')
  await expect(page.getByTestId('summary')).toContainText('Mean elevation while lit') // Planner only
  await page.getByRole('button', { name: 'Explorer' }).click()
  await expect(page.getByTestId('summary')).toContainText(/Sunny \d+% of the mission/)
  await expect(page.getByTestId('summary')).toContainText(/Can call home \d+% of the time/)
  await expect(page.getByTestId('summary')).not.toContainText('Mean elevation')
  await expect(page.getByTestId('hud-words')).toContainText(/Sun/)
  const term = page.getByTestId('term').first()
  expect((await term.getAttribute('data-tip'))!.length).toBeGreaterThan(40)
  await page.waitForTimeout(1200)
  await page.screenshot(shot('7-explorer-mode'))
})

test('scenario matrix: sites by landing dates, click-through to 3D', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await page.getByRole('button', { name: 'Scenario matrix' }).click()
  const matrix = page.getByTestId('matrix')
  await expect(matrix.locator('tbody tr')).toHaveCount(9)
  await expect(matrix.locator('tbody tr').first().locator('button')).toHaveCount(60)
  await page.getByLabel('Matrix span').selectOption('1 year, weekly')
  await expect(matrix.locator('tbody tr').first().locator('button')).toHaveCount(53)
  await page.getByLabel('Matrix metric').selectOption('dark')
  await matrix.scrollIntoViewIfNeeded()
  await page.screenshot({ ...shot('8-scenario-matrix'), fullPage: true })
  const cell = matrix.locator('tbody tr').nth(1).locator('button').nth(10)
  const label = (await cell.getAttribute('aria-label'))!
  const [, site, day] = label.match(/^(.*), (\d{4}-\d\d-\d\d): Longest dark run \d+ h$/)!
  await cell.click()
  const view = page.getByTestId('view')
  await expect(view).toContainText(`Plan: ${site}`)
  await expect(view).toContainText(day)
  expect(await hudOf(page)).toEqual(expectedHud(await observer(page)))
})

test('lunar-day playback advances the scrubber and reports the frame rate', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // the browser's own frame cap on an empty page: the ceiling for the app's number (macOS halves it on low battery)
  await page.setContent('<body style="background:#000"></body>')
  const cap = await page.evaluate(() => new Promise<number>((resolve) => {
    let frames = 0
    const t0 = performance.now()
    requestAnimationFrame(function tick(now) {
      frames++
      if (now - t0 >= 2000) resolve((frames * 1000) / (now - t0))
      else requestAnimationFrame(tick)
    })
  }))
  console.log(`PERF Empty page in the same browser (frame cap): ${cap.toFixed(0)} fps`)
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan:')
  await page.waitForTimeout(1500)
  await page.getByTestId('play').click()
  const fps = await page.evaluate(() => new Promise<number>((resolve) => {
    let frames = 0
    const t0 = performance.now()
    requestAnimationFrame(function tick(now) {
      frames++
      if (now - t0 >= 4000) resolve((frames * 1000) / (now - t0))
      else requestAnimationFrame(tick)
    })
  }))
  const renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2')!
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : 'unknown renderer'
  })
  console.log(`PERF 3D playback: ${fps.toFixed(0)} fps over 4 s at 1200 x 1000 (${renderer})`)
  expect(errors).toEqual([])
  // one lunar day takes about 20 s, so 4 s is about 140 hours in
  const hours = Number(await page.getByRole('slider').inputValue())
  expect(hours).toBeGreaterThan(100)
  expect(hours).toBeLessThan(200)
  expect(await hudOf(page)).not.toBeNull()
  await page.screenshot(shot('9-playback-trails'))
  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveText('Play lunar day')
  expect(await hudOf(page)).toEqual(expectedHud(await observer(page)))
})
