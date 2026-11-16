import { expect, test } from '@playwright/test'
import { expandPanels, expectedHud, shot, standOnTheGround } from './hud'

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

  // map clicks (F1) are Moon view clicks since D61: a site pin switches site (grid clicks: moon.spec.ts)
  await page.getByTestId('moon-pin-connecting-ridge').click()
  await expect(view).toContainText('Connecting Ridge')
  await page.waitForTimeout(1200)
  await page.screenshot({ ...shot('6-map-and-custom-point'), fullPage: true })
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
  await standOnTheGround(page) // the frame rate target is the ground view's (terrain, shadows, stars)
  await page.waitForTimeout(1500)
  await page.getByTestId('play').click()
  // hours advanced within the 4 s window itself, read at its first and last frame: counted from the click, or read
  // afterwards, the browser's own delays on a busy machine were added in (232 and 285 h instead of about 140)
  const { fps, hours } = await page.evaluate(() => new Promise<{ fps: number; hours: number }>((resolve) => {
    const scrub = () => Number(document.querySelector<HTMLInputElement>('input[type="range"]')!.value)
    let frames = 0
    let t0 = -1
    let h0 = 0
    requestAnimationFrame(function tick(now) {
      if (t0 < 0) {
        t0 = now
        h0 = scrub()
      } else frames++
      if (now - t0 >= 4000) resolve({ fps: (frames * 1000) / (now - t0), hours: scrub() - h0 })
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
  // one lunar day takes about 20 s, so 4 s of playback is about 140 hours
  expect(hours).toBeGreaterThan(100)
  expect(hours).toBeLessThan(200)
  expect(await hudOf(page)).not.toBeNull()
  await page.screenshot(shot('9-playback-trails'))
  await page.getByTestId('play').click()
  await expect(page.getByTestId('play')).toHaveText('Play lunar day')
  expect(await hudOf(page)).toEqual(expectedHud(await observer(page)))
})

test('Moon view: orbiting the pole reports the frame time (Sun visibility baked, D74)', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  // the app's own WebGL context, to wait for the GPU after each frame (a 1-pixel read-back)
  await page.addInitScript(() => {
    const get = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, options?: unknown) {
      const ctx = get.call(this, type, options as never)
      const w = window as unknown as { __gl?: WebGL2RenderingContext }
      if (type === 'webgl2' && ctx && !w.__gl) w.__gl = ctx as WebGL2RenderingContext
      return ctx
    } as typeof get
  })
  await page.goto('/')
  const moon = page.getByTestId('moon-view')
  await expect(moon).toHaveAttribute('data-relief', 'loaded', { timeout: 30_000 })
  await page.waitForTimeout(3000)
  // per frame: from its start to the GPU having finished it, while the camera is dragged round the pole
  await page.evaluate(() => {
    const w = window as unknown as { __gl: WebGL2RenderingContext; __ms: number[]; __on: boolean }
    w.__ms = []
    w.__on = true
    const px = new Uint8Array(4)
    requestAnimationFrame(function tick(now) {
      if (!w.__on) return
      setTimeout(() => {
        w.__gl.readPixels(0, 0, 1, 1, w.__gl.RGBA, w.__gl.UNSIGNED_BYTE, px)
        w.__ms.push(performance.now() - now)
        requestAnimationFrame(tick)
      }, 0)
    })
  })
  const box = (await moon.boundingBox())!
  const [cx, cy] = [box.x + box.width * 0.6, box.y + box.height * 0.5]
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  const t0 = Date.now()
  for (let i = 0; Date.now() - t0 < 3000; i++) await page.mouse.move(cx + 200 * Math.sin(i / 15), cy + 80 * Math.cos(i / 15))
  await page.mouse.up()
  const ms = await page.evaluate(() => {
    const w = window as unknown as { __ms: number[]; __on: boolean }
    w.__on = false
    return w.__ms.sort((a, b) => a - b)
  })
  const median = ms[ms.length >> 1]
  console.log(`PERF Moon view orbit at the pole: median ${median.toFixed(1)} ms per frame (${(1000 / median).toFixed(0)} fps) over ${ms.length} frames at 1200 x 1000`)
  expect(ms.length).toBeGreaterThan(5)
  expect(errors).toEqual([])
})
