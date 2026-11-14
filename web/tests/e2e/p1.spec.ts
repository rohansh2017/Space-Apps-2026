import { expect, test } from '@playwright/test'

// P1 gate: a real mask and Sun/Earth tracks show in the panorama for one site.
test('site, scrubber, panorama and 3D scene render on real data', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto('/')
  const readout = page.getByTestId('readout')
  await expect(readout).toContainText('Sun el')
  await expect(readout).not.toContainText('loading')
  await expect(page.getByRole('status')).toHaveCount(0) // no synthetic-data banner
  await page.waitForTimeout(1500) // let the heightmap decode and WebGL draw
  await page.screenshot({ path: 'tests/screenshots/p1-shackleton.png' })

  // the panorama has terrain, Sun-track and Earth-track pixels
  const colours = await page.locator('canvas.panorama').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    const seen = new Set<string>()
    for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    return ['74,79,92', '232,195,74', '95,168,255'].map((k) => seen.has(k))
  })
  expect(colours).toEqual([true, true, true])

  const before = await readout.textContent()
  await page.getByRole('slider').fill('300')
  await expect(readout).not.toHaveText(before!)
  await page.screenshot({ path: 'tests/screenshots/p1-shackleton-plus300h.png' })

  await page.getByRole('combobox').selectOption('connecting-ridge')
  await expect(readout).not.toContainText('loading')
  await page.waitForTimeout(1500)
  await page.screenshot({ path: 'tests/screenshots/p1-connecting-ridge.png' })
  expect(errors).toEqual([])
})
