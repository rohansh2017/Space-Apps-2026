import { expect, test } from '@playwright/test'
import { expandPanels, expectedHud, shot } from './hud'

const hudOf = async (page: import('@playwright/test').Page) => ({
  sunEl: await page.getByTestId('hud-sun-el').textContent(),
  earthEl: await page.getByTestId('hud-earth-el').textContent(),
  lit: await page.getByTestId('hud-lit').textContent(),
})
const observer = (page: import('@playwright/test').Page) =>
  page.getByTestId('view').evaluate((el: HTMLElement) => ({ ...el.dataset }) as Record<string, string>)

test('F11: opened alternatives are pinned to the compare tray beside the plan', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await page.getByTestId('result').first().getByRole('button', { name: 'Open in 3D' }).click()
  await expect(page.getByTestId('view')).toBeFocused() // focus follows the scenario into the view
  const tray = page.getByTestId('tray')
  await expect(tray.getByTestId('tray-plan')).toContainText('Shackleton rim')
  await expect(tray.getByTestId('tray-plan')).toContainText('2026-12-01 00:00 UTC')
  await expect(tray.getByTestId('tray-pin')).toHaveCount(1) // opening pinned it
  await expect(tray.getByTestId('tray-pin')).toContainText(/(\d+(\.\d)? km [NESW]{1,2}|Same site) · ([+−]|same date)/)
  await expect(tray.locator('canvas.panorama')).toHaveCount(2)
  await expect(tray.getByTestId('tray-plan').locator('.chip.fail').first()).toBeVisible() // the plan fails
  await expect(tray.getByTestId('tray-pin').locator('.chip.fail')).toHaveCount(0) // the top result passes
  // a second result pins beside it; the pin button toggles
  await page.getByRole('button', { name: 'Pin #2 to the compare tray' }).click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(2)
  await page.getByRole('button', { name: 'Unpin #2 from the compare tray' }).click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(1)
  // the scrubber moves every column
  await page.getByRole('slider').fill('200')
  await expect(page.getByTestId('view')).toHaveAttribute('data-hour', /\d+/)
  await page.waitForTimeout(1200)
  await page.screenshot(shot('10-compare-tray'))
  // pins travel in the share link
  expect(new URL(page.url()).searchParams.get('pins')).toMatch(/^plan,[a-z0-9-]+:\d+@\d+$/) // the live plan's column, then the pin
  // back to the plan keeps the pin
  await page.getByRole('button', { name: 'Back to plan' }).click()
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await expect(tray.getByTestId('tray-pin')).toHaveCount(1)
  // the best value in a row is marked, in words for screen readers too
  await expect(tray.getByTestId('tray-pin').locator('dd.best').first()).toContainText('(best in the tray)')
  // a pin can become the plan: the old plan takes its column
  await page.getByRole('button', { name: /^Make .* the plan$/ }).click()
  await expect(page.getByTestId('view')).toBeFocused()
  await expect(tray.getByTestId('tray-plan').locator('.chip.fail')).toHaveCount(0)
  await expect(tray.getByTestId('tray-pin').locator('.chip.fail').first()).toBeVisible()
  await expect(tray.getByTestId('tray-pin')).toContainText('2026-12-01 00:00 UTC')
})

test('F14: nudging the plan by one grid step or one day marks what changed', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
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
  await expandPanels(page)
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
  await expandPanels(page)
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
  await expandPanels(page)
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
  await expandPanels(again)
  await expect(again.getByTestId('view')).toContainText('Plan: Connecting Ridge (Barker Site 01), custom point')
  await expect(again.getByTestId('view')).toContainText('2026-12-01 00:00 UTC landing')
  await expect(again.getByLabel('Max continuous darkness')).toHaveValue('60')
  await expect(again.getByRole('button', { name: 'Explorer' })).toHaveAttribute('aria-pressed', 'true')
  expect((await observer(again)).point).toBe(state.point)
  expect(await hudOf(again)).toEqual(expectedHud(await observer(again)))
})

test('F15: the region map shows sunlit % per grid point for the mission window', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.getByTestId('illumination-legend')).toContainText('Sunlit')
  await expect(page.getByTestId('map-region')).toHaveAttribute('aria-label', /sunlit % per grid point/)
  // the sunlight ramp is on the canvas; both dark (low) and light (high) ends appear around the Shackleton rim
  // the overlay is drawn after the drawer opens, so poll the pixels rather than read them once
  const ends = () => page.getByTestId('map-region').evaluate((c: HTMLCanvasElement) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data
    let dark = 0
    let light = 0
    for (let i = 0; i < d.length; i += 4) {
      const [r, b] = [d[i], d[i + 2]]
      if (r > b + 20 && r < 140) dark++ // deep amber: little sun
      if (r > 200 && r > b + 60) light++ // pale gold: mostly sunlit
    }
    return [dark, light]
  })
  await expect.poll(async () => Math.min(...(await ends()))).toBeGreaterThan(200)
  await page.screenshot(shot('15-illumination-map'))
})

test('F22: the horizon is described from engine facts; Gemini text is kept only when its numbers are facts', async ({ page }) => {
  let invent = false
  await page.route('**/api/describe', async (route) => {
    const { facts } = route.request().postDataJSON()
    const text = invent
      ? `The ridge peaks 37° to the ${facts.ridge_direction}; sunset in 99 hours.`
      : `The skyline peaks toward the ${facts.ridge_direction} at ${facts.ridge_elevation_deg}°, and the Sun clears it ${facts.sunlit_pct}% of the time.`
    await route.fulfill({ json: { text, model: 'mock', generated: true } })
  })
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  const sentence = page.getByTestId('horizon-sentence')
  await expect(sentence).toContainText('The skyline is highest toward the')
  await expect(page.getByTestId('horizon-note')).toContainText('Template sentence')
  await page.getByRole('button', { name: 'Describe with Gemini' }).click()
  await expect(page.getByTestId('horizon-note')).toContainText('Generated by Gemini')
  await expect(sentence).toContainText('The skyline peaks toward the')
  invent = true
  await page.getByRole('slider').fill('5') // new facts: the generated text is dropped
  await expect(page.getByTestId('horizon-note')).toContainText('Template sentence')
  await page.getByRole('button', { name: 'Describe with Gemini' }).click()
  await expect(page.getByTestId('horizon-note')).toContainText('not in the facts')
  await expect(sentence).toContainText('The skyline is highest toward the')
  await expect(sentence).not.toContainText('99')
})

test('panels collapse, the band resizes, and full screen goes cinematic then restores the layout', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  // the HUD keeps its countdowns; the status card keeps its title; the band keeps the scrubber
  await page.getByRole('button', { name: 'Hide the Sun and Earth details' }).click()
  await expect(page.getByTestId('hud-sun-el')).toBeHidden()
  await expect(page.getByTestId('hud-sun-countdown')).toBeVisible()
  await page.getByRole('button', { name: /^Hide the landing time/ }).click()
  await expect(page.getByTestId('view').locator('.chip')).toHaveCount(0)
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await page.getByRole('button', { name: 'Collapse the timeline and comparison panel' }).click()
  await expect(page.getByTestId('tray')).toHaveCount(0)
  await expect(page.getByRole('slider')).toBeVisible()
  await page.getByRole('button', { name: 'Expand the timeline and comparison panel' }).click()
  // the band's top edge resizes from the keyboard too
  const grip = page.getByRole('separator', { name: /Resize the timeline/ })
  const before = await page.locator('.band').evaluate((e) => e.getBoundingClientRect().height)
  await grip.focus()
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  await expect.poll(() => page.locator('.band').evaluate((e) => e.getBoundingClientRect().height)).toBeGreaterThan(before + 40)
  // full screen collapses everything; leaving it brings back the layout the user had
  await page.getByRole('button', { name: 'Show the Sun and Earth details' }).click()
  await page.getByRole('button', { name: 'Full screen' }).click()
  await expect(page.locator('.app')).toHaveClass(/cinematic/)
  await expect(page.getByTestId('hud-sun-el')).toBeHidden()
  await expect(page.getByRole('complementary', { name: 'Plan and constraints' })).toHaveCount(0)
  await expect(page.getByTestId('tray')).toHaveCount(0)
  await page.getByRole('button', { name: 'Exit full screen' }).click()
  await expect(page.locator('.app')).not.toHaveClass(/cinematic/)
  await expect(page.getByTestId('hud-sun-el')).toBeVisible()
  await expect(page.getByTestId('tray')).toBeVisible()
  await expect(page.getByRole('complementary', { name: 'Plan and constraints' })).toBeVisible()
})

test('Plan, Map and Scenario matrix open one at a time; the alternatives fold into their corner and back', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  const side = page.getByRole('complementary', { name: 'Plan and constraints' })
  await expect(side).toBeVisible()
  await page.getByRole('button', { name: 'Map', exact: true }).click()
  await expect(page.getByTestId('drawer-map')).toBeVisible()
  await expect(side).toHaveCount(0) // opening Map closed Plan
  await page.getByRole('button', { name: 'Scenario matrix' }).click()
  await expect(page.getByTestId('drawer-matrix')).toBeVisible()
  await expect(page.getByTestId('drawer-map')).toHaveCount(0)
  await page.getByRole('button', { name: 'Plan', exact: true }).click()
  await expect(side).toBeVisible()
  await expect(page.locator('.drawer')).toHaveCount(0)
  await page.getByRole('button', { name: 'Plan', exact: true }).click() // the rail button toggles it closed too
  await expect(side).toHaveCount(0)
  await page.getByRole('button', { name: 'Plan', exact: true }).click()

  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await expect(page.getByTestId('result').first()).toBeVisible()
  await page.getByRole('button', { name: 'Minimize the alternatives' }).click()
  await expect(page.getByTestId('result')).toHaveCount(0)
  const chip = page.getByRole('button', { name: /^Show the 10 alternatives$/ })
  await expect(chip).toBeFocused()
  await chip.click()
  await expect(page.getByTestId('result')).toHaveCount(10)
  await expect(page.locator('#results-heading')).toBeFocused()
})

test('the first view is quiet, and locations survive a reload from the bare address', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  // Plan panel open; card, HUD and band folded to one line each
  await expect(page.getByRole('complementary', { name: 'Plan and constraints' })).toBeVisible()
  await expect(page.getByTestId('view').locator('.chip')).toHaveCount(0)
  await expect(page.getByTestId('hud-sun-countdown')).toBeVisible()
  await expect(page.getByTestId('hud-sun-el')).toBeHidden()
  await expect(page.getByTestId('tray')).toHaveCount(0)
  await expect(page.getByRole('slider')).toBeVisible()
  // a site, a date and a pinned scenario are stored; nothing else is
  await page.getByRole('combobox', { name: 'Site' }).selectOption('connecting-ridge')
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await expandPanels(page)
  await page.getByRole('button', { name: 'Pin this view' }).click()
  await page.getByRole('button', { name: 'Explorer' }).click()
  const stored = await page.evaluate(() => localStorage.getItem('tranquility-base:locations'))
  expect(stored).toContain('site=connecting-ridge')
  expect(stored).toContain('pins=')
  expect(stored).not.toContain('mode')
  await page.goto('/') // no query string: the stored locations fill in
  await expect(page.getByTestId('view')).toContainText('Plan: Connecting Ridge')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('2026-12-01 00:00 UTC landing')
  await expect(page.getByTestId('tray-pin')).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Planner' })).toHaveAttribute('aria-pressed', 'true') // mode is not stored
})

test('the tray starts empty; the plan is optional; any column can be the baseline the others are compared to', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await page.getByRole('button', { name: 'Expand the timeline and comparison panel' }).click()
  const tray = page.getByTestId('tray')
  await expect(tray.locator('.tray-col')).toHaveCount(0) // nothing pinned, the plan included
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await page.getByRole('button', { name: 'Pin #1 to the compare tray' }).click()
  await page.getByRole('button', { name: 'Pin #2 to the compare tray' }).click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(2)
  await expect(tray.getByTestId('tray-pin').first().getByTestId('baseline')).toBeVisible() // the first column is the baseline
  // the plan joins as a column, and can leave again
  await page.getByRole('button', { name: 'Add the plan' }).click()
  await expect(tray.getByTestId('tray-plan')).toBeVisible()
  // compare everything to #2 instead: its column carries no differences, the others are measured against it
  await page.getByRole('button', { name: /^Compare the others to 165 km/ }).click()
  const second = tray.getByTestId('tray-pin').nth(1)
  await expect(second.getByTestId('baseline')).toBeVisible()
  await expect(second.getByTestId('delta')).toHaveCount(0)
  await expect(tray.getByTestId('tray-plan').getByTestId('delta').first()).toBeVisible()
  expect(new URL(page.url()).searchParams.get('ref')).toMatch(/^im2-mons-mouton:\d+@\d+$/)
  expect(new URL(page.url()).searchParams.get('pins')).toMatch(/^plan,/)
  await page.getByRole('button', { name: 'Remove the plan from the tray' }).click()
  await expect(tray.getByTestId('tray-plan')).toHaveCount(0)
  await expect(second.getByTestId('baseline')).toBeVisible()
  // unpinning the baseline hands the role to the first column left
  await page.getByRole('button', { name: /^Unpin 165 km/ }).click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(1)
  await expect(tray.getByTestId('baseline')).toHaveCount(0) // a single column has nothing to compare to
})
