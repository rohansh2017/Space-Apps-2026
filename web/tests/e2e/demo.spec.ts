import { expect, test } from '@playwright/test'
import { expandPanels, expectedHud, shot, standOnTheGround } from './hud'

// The spec's demo script up to the must-have steps, and the P2 gate (M2):
// a slipped date returns ranked alternatives in under 3 s and opens in 3D with HUD values equal to engine values.
test('demo path: site, scrub to sunset, slip the date, find alternatives, open the best in 3D', async ({ page }) => {
  // the whole demo story in one test: its run time depends on how many other tests share the machine
  test.slow()
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  const view = page.getByTestId('view')
  const hud = async () => ({
    sunEl: await page.getByTestId('hud-sun-el').textContent(),
    earthEl: await page.getByTestId('hud-earth-el').textContent(),
    lit: await page.getByTestId('hud-lit').textContent(),
  })
  const observer = () => view.evaluate((el: HTMLElement) => ({ ...el.dataset }) as Record<string, string>)
  const settle = () => page.waitForTimeout(1200) // heightmap decode + WebGL frame

  // 1. Open at the Shackleton rim (Chang'e-7's target): the plan passes every constraint.
  await page.goto('/')
  await expandPanels(page)
  await expect(view).toContainText('Plan: Shackleton rim')
  await expect(page.getByRole('status')).toHaveCount(0) // no synthetic-data banner
  await standOnTheGround(page) // the page opens on the Moon view (moon.spec.ts); this path is the ground view's
  await expect(view.locator('.chip.fail')).toHaveCount(0)
  expect(await hud()).toEqual(expectedHud(await observer()))
  await settle()
  await expect(page.getByTestId('fill-tag')).toHaveCount(0) // sunlit: no display fill
  await page.screenshot(shot('1-plan-shackleton-rim'))

  // the panorama has terrain, Sun-track and Earth-track pixels
  const colours = await page.locator('.band-time canvas.panorama').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    const seen = new Set<string>()
    for (let i = 0; i < d.length; i += 4) seen.add(`${d[i]},${d[i + 1]},${d[i + 2]}`)
    return ['87,83,77', '240,185,85', '95,168,255'].map((k) => seen.has(k))
  })
  expect(colours).toEqual([true, true, true])

  // 2. Scrub forward to the hour the HUD counts down to: the Sun is gone.
  const sunset = await page.getByTestId('hud-sun-countdown').textContent()
  const [, d, h] = sunset!.match(/^(?:(\d+) d )?(\d+) h$/)!
  await page.getByRole('slider').fill(String(Number(d ?? 0) * 24 + Number(h)))
  await expect(page.getByTestId('hud-lit')).toHaveText('Dark')
  expect(await hud()).toEqual(expectedHud(await observer()))
  await settle()
  await page.screenshot(shot('2-scrubbed-to-sunset'))

  // 3. The launch slips 12 days: the plan now fails.
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await expect(view).toContainText('2026-12-01 00:00')
  await expect(view.locator('.chip.fail').first()).toBeVisible()
  await settle()
  await expect(page.getByTestId('fill-tag')).toBeVisible() // in shadow: the brightened view is labelled
  await page.screenshot(shot('3-slipped-date-fails'))

  // 4. Run the finder: ranked alternatives with written differences, in under 3 s.
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  const results = page.getByTestId('result')
  await expect(results.first()).toBeVisible()
  expect(Number(await page.getByTestId('finder-ms').textContent())).toBeLessThan(3000)
  await expect(results.first().locator('.chip.fail')).toHaveCount(0) // the top result meets every constraint
  await expect(results.first().getByTestId('result-title')).toHaveText(/^#1 · (\d+(\.\d)? km [NESW]{1,2}|Same site) · ([+−][\d.]+ (days?|h)|same date)$/)
  await expect(results.first().getByTestId('result-diff')).toContainText(/^[+−]\d+% sun, [+−]\d+ h dark, [+−]\d+% comms vs the plan$/)
  await page.screenshot({ ...shot('4-finder-results'), fullPage: true })

  // 5. Open the top result in 3D: HUD values equal engine values for that point and time.
  const before = await observer()
  await results.first().getByRole('button', { name: 'Open in 3D' }).click()
  await expect(view).toContainText('Alternative:')
  const after = await observer()
  expect([after.point, after.hour]).not.toEqual([before.point, before.hour])
  expect(await hud()).toEqual(expectedHud(after))
  await expect(view.locator('.chip.fail')).toHaveCount(0)
  await settle()
  await page.screenshot(shot('5-top-result-in-3d'))

  // the other presets apply and the finder still answers
  await page.getByRole('button', { name: 'Rover' }).click()
  await expect(page.getByLabel('Mission duration')).toHaveValue('14')
  // changing constraints keeps the results but marks them out of date, with a way to run the search again
  await expect(results.first()).toBeVisible()
  await expect(page.getByTestId('results-stale')).toContainText('Out of date')
  await page.getByTestId('results-stale').getByRole('button', { name: 'Run again' }).click()
  await expect(page.getByTestId('results-stale')).toHaveCount(0)
  await expect(page.getByTestId('announcer')).toContainText('Search finished')
  expect(errors).toEqual([])
})
