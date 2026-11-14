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
