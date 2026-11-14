import { expect, test } from '@playwright/test'
import { expectedHud, shot } from './hud'

const hudOf = async (page: import('@playwright/test').Page) => ({
  sunEl: await page.getByTestId('hud-sun-el').textContent(),
  earthEl: await page.getByTestId('hud-earth-el').textContent(),
  lit: await page.getByTestId('hud-lit').textContent(),
})
const observer = (page: import('@playwright/test').Page) =>
  page.getByTestId('view').evaluate((el: HTMLElement) => ({ ...el.dataset }) as Record<string, string>)

test('F11: an opened alternative is shown side by side with the plan', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await page.getByTestId('result').first().getByRole('button', { name: 'Open in 3D' }).click()
  const compare = page.getByTestId('compare')
  await expect(compare).toBeVisible()
  await expect(compare.getByTestId('compare-plan')).toContainText('Plan: Shackleton rim')
  await expect(compare.getByTestId('compare-plan')).toContainText('2026-12-01 00:00 UTC landing')
  await expect(compare.getByTestId('compare-alt')).toContainText('Alternative:')
  await expect(compare.locator('canvas.panorama')).toHaveCount(2)
  await expect(compare.getByTestId('compare-plan').locator('.chip.fail').first()).toBeVisible() // the plan fails
  await expect(compare.getByTestId('compare-alt').locator('.chip.fail')).toHaveCount(0) // the top result passes
  // the scrubber moves both panoramas
  await page.getByRole('slider').fill('200')
  await expect(page.getByTestId('view')).toHaveAttribute('data-hour', /\d+/)
  await page.waitForTimeout(1200)
  await page.screenshot({ ...shot('10-side-by-side'), fullPage: true })
  await page.getByRole('button', { name: 'Back to plan' }).click()
  await expect(compare).toHaveCount(0)
})

test('F14: nudging the plan by one grid step or one day marks what changed', async ({ page }) => {
  await page.goto('/')
  const view = page.getByTestId('view')
  await expect(view).toContainText('Plan: Shackleton rim')
  const before = await observer(page)
  await page.getByRole('button', { name: '500 m E' }).click()
  const east = await observer(page)
  expect(east.point).not.toBe(before.point)
  expect(Number(east.east)).toBeGreaterThan(Number(before.east) + 300) // moved east by about one 500 m step
  expect(Math.abs(Number(east.north) - Number(before.north))).toBeLessThan(400)
  expect(await hudOf(page)).toEqual(expectedHud(east))
  await expect(page.getByTestId('nudge-note')).toBeVisible()
  await page.getByRole('button', { name: '500 m W' }).click()
  expect((await observer(page)).point).toBe(before.point) // back where we started
  await page.getByRole('button', { name: '1 day later' }).click()
  await expect(view).toContainText('2026-11-20 00:00 UTC landing')
  expect(await hudOf(page)).toEqual(expectedHud(await observer(page)))
  await page.waitForTimeout(1200)
  await page.screenshot(shot('11-nudge'))
  await page.getByRole('button', { name: '1 day earlier' }).click()
  await expect(view).toContainText('2026-11-19 00:00 UTC landing')
})

test('F13: the Explorer tour walks three steps and starts playback on step 2', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('view')).toContainText('Plan:')
  await expect(page.getByRole('button', { name: 'Start tour' })).toHaveCount(0) // Planner mode has no tour
  await page.getByRole('button', { name: 'Explorer' }).click()
  await page.getByRole('button', { name: 'Start tour' }).click()
  const tour = page.getByTestId('tour')
  await expect(tour).toContainText('step 1 of 3')
  await expect(tour).toContainText('On Earth, the Sun climbs')
  await expect(tour.locator('svg')).toBeVisible()
  await expect(page.getByTestId('play')).toHaveText('Play lunar day')
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour).toContainText('step 2 of 3')
  await expect(page.getByTestId('play')).toHaveText('Pause') // playback started
  await page.waitForTimeout(1500)
  await page.screenshot(shot('12-tour-step-2'))
  await tour.getByRole('button', { name: 'Next' }).click()
  await expect(tour).toContainText('step 3 of 3')
  await expect(page.getByTestId('play')).toHaveText('Play lunar day') // playback paused for the last step
  await expect(tour.getByRole('button', { name: 'Next' })).toHaveCount(0)
  await tour.getByRole('button', { name: 'Finish' }).click()
  await expect(tour).toHaveCount(0)
  // switching back to Planner closes an open tour
  await page.getByRole('button', { name: 'Start tour' }).click()
  await expect(page.getByTestId('tour')).toBeVisible()
  await page.getByRole('button', { name: 'Planner' }).click()
  await expect(page.getByTestId('tour')).toHaveCount(0)
})

test('F21: a typed sentence fills the panel only after the user confirms, and bad values are rejected', async ({ page }) => {
  // the Worker route is mocked here; gemini.spec.ts calls the real one against a deployment
  await page.route('**/api/constraints', async (route) => {
    const { sentence } = route.request().postDataJSON()
    const values = sentence.includes('999')
      ? { mission_duration_days: 999, fuel_kg: 10, max_slope_deg: 8 }
      : { max_continuous_dark_hours: 96, min_earth_visible_pct: 50 }
    await route.fulfill({ json: { values, model: 'mock', generated: true } })
  })
  await page.goto('/')
  await expect(page.getByTestId('view')).toContainText('Plan:')
  const box = page.getByPlaceholder(/survive 4 days of dark/)
  await box.fill('survive 4 days of dark, talk to Earth half the time')
  await page.getByRole('button', { name: 'Interpret with Gemini' }).click()
  const suggestion = page.getByTestId('suggestion')
  await expect(suggestion).toContainText('Max continuous darkness: 96 hours')
  await expect(suggestion).toContainText('Min Earth visibility: 50 %')
  await expect(page.getByLabel('Max continuous darkness')).toHaveValue('80') // nothing applied yet
  await page.screenshot(shot('14-gemini-suggestion'))
  await page.getByRole('button', { name: 'Apply to the panel' }).click()
  await expect(page.getByLabel('Max continuous darkness')).toHaveValue('96')
  await expect(page.getByLabel('Min Earth visibility')).toHaveValue('50')
  await expect(page.getByLabel('Mission duration')).toHaveValue('7') // untouched fields keep their values
  await expect(suggestion).toHaveCount(0)

  await box.fill('mission of 999 days with slopes under 8')
  await page.getByRole('button', { name: 'Interpret with Gemini' }).click()
  await expect(page.getByTestId('suggestion-rejected')).toContainText('mission_duration_days = 999 (outside 1–30 days)')
  await expect(page.getByTestId('suggestion-rejected')).toContainText('fuel_kg (unknown field)')
  await expect(suggestion).toContainText('Max terrain slope: 8 deg')
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByLabel('Mission duration')).toHaveValue('7')
})

test('F17: the URL carries site, point, date, constraints and mode, and reopens to the same state', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await page.getByRole('combobox', { name: 'Site' }).selectOption('connecting-ridge')
  await page.getByRole('button', { name: '500 m E' }).click()
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByLabel('Max continuous darkness').fill('60')
  await page.getByRole('button', { name: 'Explorer' }).click()
  await expect(page).toHaveURL(/site=connecting-ridge/)
  await expect(page).toHaveURL(/point=\d+/)
  await expect(page).toHaveURL(/t=2026-12-01T00%3A00Z/)
  await expect(page).toHaveURL(/c=max_continuous_dark_hours%3A60/)
  await expect(page).toHaveURL(/mode=explorer/)
  const state = await observer(page)
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByText('Link copied')).toBeVisible()

  const again = await context.newPage()
  await again.goto(page.url())
  await expect(again.getByTestId('view')).toContainText('Plan: Connecting Ridge (Barker Site 01), custom point')
  await expect(again.getByTestId('view')).toContainText('2026-12-01 00:00 UTC landing')
  await expect(again.getByLabel('Max continuous darkness')).toHaveValue('60')
  await expect(again.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-pressed', 'true')
  expect((await observer(again)).point).toBe(state.point)
  expect(await hudOf(again)).toEqual(expectedHud(await observer(again)))
})

test('F15: the region map shows sunlit % per grid point for the mission window', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await expect(page.getByTestId('illumination-legend')).toContainText('Sunlit')
  await expect(page.getByTestId('map-region')).toHaveAttribute('aria-label', /sunlit % per grid point/)
  // the ramp's blues are on the canvas; both dark (low) and light (high) ends appear around the Shackleton rim
  const ends = await page.getByTestId('map-region').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let dark = 0
    let light = 0
    for (let i = 0; i < d.length; i += 4) {
      const [r, g, b] = [d[i], d[i + 1], d[i + 2]]
      if (b > r + 40 && b > g + 10 && b < 150) dark++
      if (b > r + 40 && b > 200) light++
    }
    return [dark, light]
  })
  expect(ends[0]).toBeGreaterThan(200)
  expect(ends[1]).toBeGreaterThan(200)
  await page.getByTestId('map-region').scrollIntoViewIfNeeded()
  await page.screenshot({ ...shot('15-illumination-map'), fullPage: true })
})
