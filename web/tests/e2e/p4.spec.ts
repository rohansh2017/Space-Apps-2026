import { expect, test } from '@playwright/test'
import { expandPanels, expectedHud, shot } from './hud'

const hudOf = async (page: import('@playwright/test').Page) => ({
  sunEl: await page.getByTestId('hud-sun-el').textContent(),
  earthEl: await page.getByTestId('hud-earth-el').textContent(),
  lit: await page.getByTestId('hud-lit').textContent(),
})
const observer = (page: import('@playwright/test').Page) =>
  page.getByTestId('view').evaluate((el: HTMLElement) => ({ ...el.dataset }) as Record<string, string>)

test('F11: the plan and alternatives are pinned side by side; opening a result does not pin it', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  const tray = page.getByTestId('tray')
  await page.getByRole('button', { name: 'Pin this view' }).click() // the plan, frozen at its point and date
  await expect(tray.getByTestId('tray-pin')).toHaveCount(1)
  await expect(tray.getByTestId('tray-pin').first()).toContainText('2026-12-01 00:00 UTC')
  await expect(tray.getByTestId('plan-tag')).toHaveCount(1)
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await page.getByTestId('result').first().getByRole('button', { name: 'Open in 3D' }).click()
  await expect(page.getByTestId('view')).toBeFocused() // focus follows the scenario into the view
  await expect(tray.getByTestId('tray-pin')).toHaveCount(1) // opening did not pin it (D59)
  await page.getByRole('button', { name: 'Pin this view' }).click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(2)
  await expect(page.getByRole('button', { name: 'Unpin this view' })).toBeVisible() // the button now unpins what is in view
  const [planCol, top] = [tray.getByTestId('tray-pin').nth(0), tray.getByTestId('tray-pin').nth(1)]
  await expect(top).toContainText(/(\d+(\.\d)? km [NESW]{1,2}|Same site) · ([+−]|same date)/)
  await expect(tray.locator('canvas.panorama')).toHaveCount(2)
  await expect(planCol.locator('.chip.fail').first()).toBeVisible() // the plan fails
  await expect(top.locator('.chip.fail')).toHaveCount(0) // the top result passes
  // a second result pins beside it; the pin button toggles
  await page.getByRole('button', { name: 'Pin #2 to the compare tray' }).click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(3)
  await page.getByRole('button', { name: 'Unpin #2 from the compare tray' }).click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(2)
  // the scrubber moves every column
  await page.getByRole('slider', { name: /^Lunar day/ }).fill('200')
  await expect(page.getByTestId('view')).toHaveAttribute('data-hour', /\d+/)
  await page.waitForTimeout(1200)
  await page.screenshot(shot('10-compare-tray'))
  // pins travel in the share link
  expect(new URL(page.url()).searchParams.get('pins')).toMatch(/^[a-z0-9-]+:\d+@\d+,[a-z0-9-]+:\d+@\d+$/) // two frozen scenarios, no live column
  // back to the plan keeps the pins
  await page.getByRole('button', { name: 'Back to plan' }).click()
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await expect(tray.getByTestId('tray-pin')).toHaveCount(2)
  // the best value in a row is marked, in words for screen readers too
  await expect(top.locator('dd.best').first()).toContainText('(best in the tray)')
  // a pin can become the plan: the old plan takes its column
  await page.getByRole('button', { name: /^Make .* the plan$/ }).click()
  await expect(page.getByTestId('view')).toBeFocused()
  await expect(page.getByTestId('view').locator('.chip.fail')).toHaveCount(0)
  await expect(tray.getByTestId('plan-tag')).toHaveCount(0) // the old plan's columns are no longer the plan
  await expect(tray.getByTestId('tray-pin').nth(1).locator('.chip.fail').first()).toBeVisible()
  await expect(tray.getByTestId('tray-pin').nth(1)).toContainText('2026-12-01 00:00 UTC')
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

test('F21: a typed requirement fills the panel only after the user confirms, and bad values are rejected', async ({ page }) => {
  // the Worker route is mocked here; gemini.spec.ts calls the real one against a deployment.
  // One button since D70: requirements go through the same copilot route as a slip.
  await page.route('**/api/copilot', async (route) => {
    const { sentence } = route.request().postDataJSON()
    const constraints = sentence.includes('999')
      ? { mission_duration_days: 999, fuel_kg: 10, max_slope_deg: 8 }
      : { max_continuous_dark_hours: 96, min_earth_visible_pct: 50 }
    await route.fulfill({ json: { plan: { constraints }, model: 'mock', generated: true } })
  })
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan:')
  const box = page.getByPlaceholder(/survive 4 days of dark/)
  await box.fill('survive 4 days of dark, talk to Earth half the time')
  await page.getByRole('button', { name: 'Ask Gemini' }).click()
  const suggestion = page.getByTestId('suggestion')
  await expect(suggestion).toContainText('Max continuous darkness: 96 hours')
  await expect(suggestion).toContainText('Min Earth visibility: 50 %')
  await expect(page.getByLabel('Max continuous darkness')).toHaveValue('80') // nothing applied yet
  await page.screenshot(shot('14-gemini-suggestion'))
  await page.getByRole('button', { name: 'Apply and find alternatives' }).click()
  await expect(page.getByLabel('Max continuous darkness')).toHaveValue('96')
  await expect(page.getByLabel('Min Earth visibility')).toHaveValue('50')
  await expect(page.getByLabel('Mission duration')).toHaveValue('7') // untouched fields keep their values
  await expect(suggestion).toHaveCount(0)
  // no slip was given: the date stays and the answer speaks of the plan as it stands
  await expect(page.getByTestId('copilot-summary')).toContainText(/The plan (still meets|fails)/, { timeout: 30_000 })

  await box.fill('mission of 999 days with slopes under 8')
  await page.getByRole('button', { name: 'Ask Gemini' }).click()
  await expect(page.getByTestId('suggestion-rejected')).toContainText('mission_duration_days = 999 (outside 1–30 days)')
  await expect(page.getByTestId('suggestion-rejected')).toContainText('fuel_kg (unknown field)')
  await expect(suggestion).toContainText('Max terrain slope: 8 deg')
  await page.getByRole('button', { name: 'Discard' }).click()
  await expect(page.getByLabel('Mission duration')).toHaveValue('7')
})

test('F26 + F27: the copilot plans a slip in one call, the engine answers, and "why not" costs nothing until asked', async ({ page }) => {
  // routes are mocked: no Gemini tokens are spent here (gemini.spec.ts makes the live calls under make e2e-live)
  const calls: string[] = []
  await page.route('**/api/copilot', async (route) => {
    calls.push('copilot')
    await route.fulfill({ json: { plan: {
      constraints: { min_earth_visible_pct: 100 }, slip: { days: 3, quote: 'slip 3 days' }, where: { scope: 'sites', sites: ['haworth'], quote: 'move to Haworth' },
    }, model: 'mock', generated: true } })
  })
  let invent = false
  await page.route('**/api/whynot', async (route) => {
    calls.push('whynot')
    const { facts } = route.request().postDataJSON()
    const text = invent ? 'It fails; land 999 days later.' : `It fails on ${facts.fails[0].constraint}; the engine's limit is ${facts.fails[0].limit}${facts.fails[0].unit}.`
    await route.fulfill({ json: { text, model: 'mock', generated: true } })
  })
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  const before = await page.getByLabel('Landing date and time (UTC)').inputValue()
  await page.getByPlaceholder(/survive 4 days of dark/).fill('we slip 3 days, move to Haworth, and need Earth in view the whole time')
  await page.getByRole('button', { name: 'Ask Gemini' }).click()
  const suggestion = page.getByTestId('suggestion')
  await expect(page.getByTestId('copilot-site')).toContainText('Haworth')
  await expect(page.getByTestId('copilot-slip')).toContainText('3 days later')
  await expect(suggestion).toContainText('Min Earth visibility: 100 %')
  await expect(page.getByRole('combobox', { name: 'Site' })).not.toHaveValue('haworth') // nothing applied yet
  await page.getByRole('button', { name: 'Apply and find alternatives' }).click()
  await expect(page.getByTestId('copilot-summary')).toContainText(/alternatives|slipped plan/, { timeout: 30_000 })
  await expect(page.getByRole('combobox', { name: 'Site' })).toHaveValue('haworth')
  await expect(page.getByLabel('Min Earth visibility')).toHaveValue('100')
  const after = await page.getByLabel('Landing date and time (UTC)').inputValue()
  expect(Date.parse(`${after}Z`) - Date.parse(`${before}Z`)).toBe(3 * 24 * 3600 * 1000) // exactly 3 days later
  // F27: the engine's "why not" is on screen without any Gemini call
  const why = page.getByTestId('plan-whynot')
  await expect(why).toContainText('Fails on')
  await expect(why).toContainText('Earth visibility')
  expect(calls).toEqual(['copilot'])
  await page.getByRole('button', { name: 'Say it plainly' }).click()
  await expect(page.getByTestId('plan-whynot-note')).toContainText('every number checked')
  invent = true
  await page.getByLabel('Mission duration').fill('8') // marks the results stale; the line goes
  await expect(why).toHaveCount(0)
  await page.getByRole('button', { name: 'Run again' }).click()
  await expect(why).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Say it plainly' }).click()
  await expect(page.getByTestId('plan-whynot-note')).toContainText('did not match the facts')
  await expect(page.getByTestId('plan-whynot-text')).not.toContainText('999')
  expect(calls).toEqual(['copilot', 'whynot', 'whynot']) // one call per press, none otherwise
})

test('F29: "slipped by 11 days, stay near the rim" moves the landing 11 days from the original plan, once, and searches only this site', async ({ page }) => {
  const calls: string[] = []
  let reply: unknown = {
    slip: { days: 11, quote: 'slipped by 11 days' }, where: { scope: 'current', quote: 'stay near the rim' }, constraints: {},
  }
  await page.route('**/api/copilot', async (route) => {
    calls.push('copilot')
    if (reply === 429) await route.fulfill({ status: 429, json: { error: 'Too many requests; try again in a minute' } })
    else await route.fulfill({ json: { plan: reply, model: 'mock', generated: true } })
  })
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  const dateBox = page.getByLabel('Landing date and time (UTC)')
  const original = Date.parse(`${await dateBox.inputValue()}Z`)
  const box = page.getByPlaceholder(/survive 4 days of dark/)
  const plan = async (text: string) => {
    await box.fill(text)
    await page.getByRole('button', { name: 'Ask Gemini' }).click()
    await expect(page.getByTestId('suggestion')).toBeVisible()
  }
  await plan('My mission slipped by 11 days. Stay near the rim.')
  await expect(page.getByTestId('copilot-slip')).toContainText('11 days later than the original plan')
  await expect(page.getByTestId('copilot-where')).toContainText("Shackleton rim (Chang'e-7 target)'s grid within 5 km")
  await page.getByRole('button', { name: 'Apply and find alternatives' }).click()
  const summary = page.getByTestId('copilot-summary')
  await expect(summary).toContainText('Slipped 11 days from', { timeout: 30_000 })
  await expect(summary).toContainText("Searched Shackleton rim (Chang'e-7 target)'s grid within 5 km")
  expect(Date.parse(`${await dateBox.inputValue()}Z`) - original).toBe(11 * 86_400_000)
  const results = await page.getByTestId('result').all()
  expect(results.length).toBeGreaterThan(0)
  for (const r of results) await expect(r.locator('.result-title > span')).toContainText('Shackleton rim')
  await expect(page.getByTestId('search-spec')).toContainText('grid within 5 km')

  // the same slip again is measured from the original plan: still 11 days, not 22
  await plan('My mission slipped by 11 days, stay near the rim')
  await expect(page.getByTestId('copilot-slip')).toContainText(new Date(original).toISOString().slice(0, 16).replace('T', ' '))
  await page.getByRole('button', { name: 'Apply and find alternatives' }).click()
  await expect(summary).toContainText('Slipped 11 days from', { timeout: 30_000 })
  expect(Date.parse(`${await dateBox.inputValue()}Z`) - original).toBe(11 * 86_400_000)

  // any site, earliest first: every grid is searched and passing results come in date order
  reply = { where: { scope: 'all', quote: 'any site' }, when: { order: 'earliest', quote: 'as soon as possible' } }
  await plan('any site is fine, as soon as possible')
  await expect(page.getByTestId('copilot-when')).toContainText('earliest date that meets everything first')
  await page.getByRole('button', { name: 'Apply and find alternatives' }).click()
  await expect(summary).toContainText("Searched every site's full grid", { timeout: 30_000 })
  await expect(page.getByTestId('finder-summary')).toContainText('across 3969 points')
  const starts: number[] = []
  for (const r of await page.getByTestId('result').all()) {
    if (await r.getByTestId('result-whynot').count()) break // failing results follow the passing ones
    starts.push(Date.parse(`${(await r.locator('.result-title > span').innerText()).match(/\d{4}-\d\d-\d\d \d\d:\d\d/)![0].replace(' ', 'T')}Z`))
  }
  expect(starts).toEqual([...starts].sort((a, b) => a - b))
  await page.getByRole('button', { name: 'Remove: earliest first' }).click()
  await expect(page.getByTestId('results-stale')).toBeVisible()

  // Gemini unreachable: the slip is still read from the words
  reply = 429
  await plan('launch delayed 2 days')
  await expect(page.getByTestId('copilot-note')).toContainText('Read without Gemini (Too many requests')
  await expect(page.getByTestId('copilot-slip')).toContainText('2 days later')
  expect(calls).toEqual(['copilot', 'copilot', 'copilot', 'copilot']) // one call per press
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

test('F15: the Moon view colours each 500 m cell by its sunlit % for the mission window, and the pins at the pole', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  // at the pole, Sunlight tints each site pin by its own sunlit % (engine)
  await page.getByRole('button', { name: 'Sunlight', exact: true }).click()
  await expect(page.getByTestId('moon-legend')).toContainText('at each site')
  await expect(page.getByTestId('moon-pin-haworth').locator('i.tinted')).toHaveCount(1)
  await expect(page.getByTestId('moon-pin-haworth')).toHaveAttribute('aria-label', /sunlit \d+%, Earth \d+%/)
  // at the site: a heat map of filled cells over the terrain
  await page.getByTestId('moon-pin-change7-shackleton-rim').click()
  await expect(page.getByTestId('moon-legend')).toContainText('per 500 m cell')
  // the sunlight ramp is on the overlay; both dark (low) and light (high) ends appear around the Shackleton rim
  const ends = () => page.locator('canvas.moon-overlay').evaluate((c: HTMLCanvasElement) => {
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
  await page.getByRole('slider', { name: /^Lunar day/ }).fill('5') // new facts: the generated text is dropped
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
  await expect(page.getByRole('slider', { name: /^Lunar day/ })).toBeVisible()
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

test('Plan and Scenario matrix open one at a time; the alternatives fold into their corner and back', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  const side = page.getByRole('complementary', { name: 'Plan and constraints' })
  await expect(side).toBeVisible()
  await expect(page.getByRole('button', { name: 'Map', exact: true })).toHaveCount(0) // the Map drawer is gone (D61)
  await page.getByRole('button', { name: 'Scenario matrix' }).click()
  await expect(page.getByTestId('drawer-matrix')).toBeVisible()
  await expect(side).toHaveCount(0) // opening the matrix closed Plan
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
  await expect(page.getByRole('slider', { name: /^Lunar day/ })).toBeVisible()
  // a site, a date and a pinned scenario are stored; nothing else is
  await page.getByRole('combobox', { name: 'Site' }).selectOption('connecting-ridge')
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await expandPanels(page)
  await page.getByRole('button', { name: 'Pin this view' }).click()
  await page.getByRole('button', { name: 'Explorer' }).click()
  const stored = await page.evaluate(() => localStorage.getItem('tranquility-base:locations'))
  expect(stored).toContain('site=connecting-ridge')
  expect(stored).toContain('pins=connecting-ridge%3A220%40')
  expect(stored).not.toContain('mode')
  await page.goto('/') // no query string: the stored locations fill in
  await expect(page.getByTestId('view')).toContainText('Plan: Connecting Ridge')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('2026-12-01 00:00 UTC landing')
  await expect(page.getByTestId('tray-pin')).toHaveCount(1) // restored from storage, not re-pinned
  await expect(page.getByRole('button', { name: 'Unpin this view' })).toBeEnabled() // what is in view is that pin
  await expect(page.getByRole('button', { name: 'Planner' })).toHaveAttribute('aria-pressed', 'true') // mode is not stored
})

test('the tray starts empty; any column can be the baseline the others are compared to', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await page.getByRole('button', { name: 'Expand the timeline and comparison panel' }).click()
  const tray = page.getByTestId('tray')
  await expect(tray.locator('.tray-col')).toHaveCount(0) // nothing pinned, the plan included
  await expect(tray.locator('.tray-labels')).toContainText('Mean elevation while lit') // the row labels show anyway
  await expect(page.getByRole('button', { name: 'Add the plan' })).toHaveCount(0)
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await page.getByRole('button', { name: 'Pin #1 to the compare tray' }).click()
  await page.getByRole('button', { name: 'Pin #2 to the compare tray' }).click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(2)
  await expect(tray.getByTestId('tray-pin').first().getByTestId('baseline')).toBeVisible() // the first column is the baseline
  // with the plan in view, Pin this view adds a snapshot of the plan; it can leave again
  await page.getByRole('button', { name: 'Pin this view' }).click()
  await expect(tray.getByTestId('plan-tag')).toHaveCount(1)
  // compare everything to #2 instead: its column carries no differences, the others are measured against it
  await page.getByRole('button', { name: /^Compare the others to 165 km/ }).click()
  const second = tray.getByTestId('tray-pin').nth(1)
  await expect(second.getByTestId('baseline')).toBeVisible()
  await expect(tray.getByTestId('compared-to')).toContainText('B · 165 km')
  await expect(second.getByTestId('delta')).toHaveCount(0)
  await expect(tray.getByTestId('tray-pin').nth(2).getByTestId('delta').first()).toBeVisible()
  expect(new URL(page.url()).searchParams.get('ref')).toMatch(/^im2-mons-mouton:\d+@\d+$/)
  await page.getByRole('button', { name: 'Unpin this view' }).click()
  await expect(tray.getByTestId('plan-tag')).toHaveCount(0)
  await expect(second.getByTestId('baseline')).toBeVisible()
  // unpinning the baseline hands the role to the first column left
  await page.getByRole('button', { name: /^Unpin 165 km/ }).click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(1)
  await expect(tray.getByTestId('baseline')).toHaveCount(0) // a single column has nothing to compare to
})

test('pins are snapshots: pin spot after spot, the button never dies, a full tray asks, columns reorder by drag and keys', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  const tab = page.getByRole('button', { name: 'Collapse the timeline and comparison panel' })
  await expect(tab).toContainText('Hide') // the band's tab says what it does (D59)
  const tray = page.getByTestId('tray')
  const pin = page.getByRole('button', { name: 'Pin this view' })
  // move the plan one grid step at a time and pin each spot: every press is a new column
  await pin.click()
  for (const d of ['500 m E', '500 m N', '500 m W']) {
    await page.getByRole('button', { name: d, exact: true }).click()
    await expect(pin).toBeEnabled()
    await pin.click()
  }
  await expect(tray.getByTestId('tray-pin')).toHaveCount(4)
  await expect(tray.locator('.tray-letter')).toHaveText(['A', 'B', 'C', 'D'])
  // a fifth spot: the button still works and the tray asks which column to replace
  await page.getByRole('button', { name: '500 m S', exact: true }).click()
  await page.getByRole('button', { name: '500 m S', exact: true }).click()
  await pin.click()
  await expect(page.locator('.tray-full')).toContainText('Replace which one')
  await page.locator('.tray-full').getByRole('button', { name: /^Replace / }).first().click()
  await expect(tray.getByTestId('tray-pin')).toHaveCount(4)
  await expect(page.getByRole('button', { name: 'Unpin this view' })).toBeVisible()
  // the baseline is the first column until chosen; choose C, then reorder: the baseline stays on its scenario
  const keys = () => tray.getByTestId('tray-pin').evaluateAll((els) => els.map((e) => e.getAttribute('data-key')))
  const before = await keys()
  await tray.getByTestId('tray-pin').nth(2).getByRole('button', { name: /^Compare the others to/ }).click()
  await tray.getByTestId('tray-grip').nth(2).dragTo(tray.getByTestId('tray-pin').nth(0))
  await expect.poll(keys).toEqual([before[2], before[0], before[1], before[3]])
  await expect(tray.getByTestId('tray-pin').nth(0).getByTestId('baseline')).toBeVisible()
  await expect(tray.getByTestId('tray-pin').nth(0).locator('.tray-letter')).toHaveText('A')
  // keyboard: Alt+Right on a grip moves its column one place
  await tray.getByTestId('tray-grip').nth(0).focus()
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(keys).toEqual([before[0], before[2], before[1], before[3]])
  await expect(page.getByTestId('announcer')).toContainText('Moved to position B')
  expect(new URL(page.url()).searchParams.get('pins')!.split(',')).toEqual([before[0], before[2], before[1], before[3]])
  await page.waitForTimeout(400) // a moved column replays its short rise-in
  await page.screenshot(shot('21-tray-four-pins'))
})

test('a link from before D59 with the live plan column opens with a snapshot of the plan, and it stays the baseline', async ({ page }) => {
  await page.goto('/?site=haworth&t=2026-12-01T00:00Z&pins=plan,im2-mons-mouton:220@8016&ref=plan')
  await expandPanels(page)
  const tray = page.getByTestId('tray')
  await expect(tray.getByTestId('tray-pin')).toHaveCount(2)
  await expect(tray.getByTestId('tray-pin').first().getByTestId('plan-tag')).toBeVisible()
  await expect(tray.getByTestId('tray-pin').first().getByTestId('baseline')).toBeVisible()
  await expect(page).toHaveURL(/pins=haworth%3A220%408016%2Cim2-mons-mouton%3A220%408016/)
  await expect(page).toHaveURL(/ref=haworth%3A220%408016/)
})

test('fewer clicks (D61): the folded card shows the tally, Pin and Pole are one click from either view, results go straight to the Moon', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await expect(page.getByTestId('card-tally')).toHaveText('5 of 5 constraints met') // folded card, no click
  // pin from the Moon bar with the band folded: the band opens on the new column
  await expect(page.getByTestId('tray')).toHaveCount(0)
  await page.getByTestId('moon-pin-view').click()
  await expect(page.getByTestId('tray-pin')).toHaveCount(1)
  await expect(page.getByTestId('moon-pin-view')).toHaveAttribute('aria-pressed', 'true')
  // a pin's own 3D button stands on that site in one click
  await page.getByTestId('moon-pin-haworth').hover()
  await page.getByTestId('moon-stand-haworth').click()
  await expect(page.getByTestId('moon-view')).toHaveCount(0)
  await expect(page.getByTestId('view')).toContainText('Plan: Haworth')
  // from the ground: Pin and Pole
  await page.getByTestId('stage-pin').click()
  await expect(page.getByTestId('tray-pin')).toHaveCount(2)
  await page.getByTestId('stage-pole').click()
  await expect(page.getByTestId('moon-view')).toHaveAttribute('data-level', 'pole')
  // a finder result shows on the Moon in one click
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await page.getByRole('button', { name: /^Show on the Moon: #1,/ }).click()
  await expect(page.getByTestId('moon-view')).toHaveAttribute('data-level', 'site')
  await expect(page.getByTestId('view')).toContainText('Alternative:')
})

test('F30: filters hide behind the funnel, narrow the alternatives, stay visible as pills, and clear back to the top 10', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  const rows = page.getByTestId('result')
  await expect(rows).toHaveCount(10)
  const toggle = page.getByTestId('filter-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('results-filter')).toHaveCount(0) // hidden by default
  await toggle.click()
  const menu = page.getByTestId('results-filter')
  await expect(menu).toBeVisible()

  // days out (a slider since F32): every shown landing is at most 3 days after the plan
  await menu.getByLabel('Maximum days out').fill('3')
  await expect(menu.getByTestId('days-value')).toHaveText('0 to 3 days')
  const shiftHours = (t: string) => {
    const m = t.match(/· ([+−])([\d.]+) (h|days?)$/)
    return m ? Number(m[2]) * (m[3] === 'h' ? 1 : 24) : 0 // "same date"
  }
  for (const t of await page.getByTestId('result-title').allInnerTexts()) expect(shiftHours(t)).toBeLessThanOrEqual(72)

  // site: only the first result's site
  await page.getByTestId('filter-pills').getByRole('button', { name: /^Remove filter: Up to 3 days out$/ }).click()
  const site = (await rows.first().locator('.result-title > span').innerText()).split(' · ')[0]
  const siteBox = menu.getByRole('checkbox', { name: site, exact: true })
  if (await siteBox.count()) {
    await siteBox.check()
    for (const r of await rows.all()) await expect(r.locator('.result-title > span')).toContainText(site)
  }

  // criteria: meets every constraint leaves no failing chip (or says nothing matches)
  await menu.getByRole('checkbox', { name: 'Meets every constraint' }).check()
  if (await rows.count()) await expect(page.locator('.results .chip.fail')).toHaveCount(0)
  else await expect(page.getByTestId('filter-empty')).toBeVisible()

  // hiding the menu keeps the filters, shown as pills and a badge
  await menu.getByRole('button', { name: 'Hide filters' }).click()
  await expect(page.getByTestId('results-filter')).toHaveCount(0)
  await expect(toggle).toHaveAccessibleName(/Filters, \d active/)
  await expect(page.getByRole('button', { name: 'Remove filter: Meets every constraint' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove filter: Meets every constraint' }).click()
  await page.getByTestId('filter-pills').getByRole('button', { name: 'Clear all' }).click()
  await expect(page.getByTestId('filter-pills')).toHaveCount(0)
  await expect(rows).toHaveCount(10)
  await expect(page.getByTestId('result-title').first()).toContainText('#1 ·')

  // sort: soonest landing puts the dates in order, and a pinned row still pins
  await page.getByTestId('results-sort').selectOption('soonest')
  const starts = []
  for (const r of await rows.all())
    starts.push(Date.parse(`${(await r.locator('.result-title > span').innerText()).match(/\d{4}-\d\d-\d\d \d\d:\d\d/)![0].replace(' ', 'T')}Z`))
  expect(starts).toEqual([...starts].sort((a, b) => a - b))
  await rows.first().getByRole('button', { name: /^Pin #\d+ to the compare tray$/ }).click()
  await expect(page.getByTestId('tray').getByTestId('tray-pin')).toHaveCount(1)
})

test('F31: Recompute ranks on the ticked criteria alone, and pressing it again restores the full search', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await expect(page.getByTestId('result')).toHaveCount(10)
  await page.getByTestId('filter-toggle').click()
  const menu = page.getByTestId('results-filter')
  const recompute = menu.getByTestId('recompute')
  await expect(recompute).toBeDisabled() // nothing ticked yet
  await menu.getByRole('checkbox', { name: 'Max terrain slope' }).check()
  await menu.getByRole('checkbox', { name: 'Min Earth visibility' }).check()
  await recompute.click()
  await expect(page.getByTestId('focus-note')).toContainText('Ranked on Min Earth visibility and Max terrain slope only')
  await expect(page.getByTestId('finder-summary')).toContainText('meet the chosen criteria')
  await expect(page.getByTestId('result').first()).toBeVisible()
  // only the chosen criteria are judged on each row
  const chips = await page.locator('.results li').first().locator('.chip').allInnerTexts()
  expect(chips.every((c) => /Earth|Slope/.test(c))).toBe(true)
  await page.getByTestId('focus-note').getByRole('button', { name: 'Use every criterion' }).click()
  await expect(page.getByTestId('focus-note')).toHaveCount(0)
  await expect(page.getByTestId('finder-summary')).toContainText('meet every constraint')
  await expect(page.locator('.results li').first().locator('.chip')).not.toHaveCount(2)
})

test('F32: a criterion slider filters the list without a search, and Recompute writes its value into the Constraints panel', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await expect(page.getByTestId('result')).toHaveCount(10)
  const before = await page.getByTestId('finder-ms').innerText()
  await page.getByTestId('filter-toggle').click()
  const menu = page.getByTestId('results-filter')
  // every criterion's slider is there before anything is ticked; moving one ticks it
  for (const name of ['Min continuous sunlight', 'Max continuous darkness', 'Min Earth visibility', 'Max terrain slope'])
    await expect(menu.getByLabel(`${name} threshold`)).toBeVisible()
  const slider = menu.getByLabel('Max continuous darkness threshold')
  await expect(slider).toHaveValue('80') // starts at the search's constraint
  await expect(menu.getByRole('checkbox', { name: 'Max continuous darkness' })).not.toBeChecked()
  const count = page.getByTestId('filter-count')
  const total = Number((await count.innerText()).match(/of (\d+)/)![1]) // "Top 10 of N" while nothing filters
  const matches = async () => Number((await count.innerText()).match(/^(\d+) of/)![1])
  await slider.fill('0')
  await expect(menu.getByRole('checkbox', { name: 'Max continuous darkness' })).toBeChecked()
  await expect(menu.getByTestId('threshold-max_continuous_dark_hours')).toContainText('Dark up to 0 h')
  expect(await matches()).toBeLessThanOrEqual(total)
  await expect(page.getByTestId('finder-ms')).toHaveText(before) // filtered, not searched
  await expect(page.getByRole('button', { name: 'Remove filter: Dark up to 0 h' })).toBeVisible()

  await slider.fill('120')
  await expect(menu.getByTestId('recompute')).toHaveText('Recompute ticked with these values')
  await menu.getByTestId('recompute').click()
  await expect(page.getByTestId('focus-note')).toContainText('Ranked on Max continuous darkness only') // F31 still applies to the ticked set
  await expect(page.locator('#constraint-max_continuous_dark_hours')).toHaveValue('120') // the Constraints panel field
  await expect(page.getByTestId('results-stale')).toHaveCount(0)
  await expect(page.getByTestId('results-filter').getByLabel('Max continuous darkness threshold')).toHaveValue('120')
})
