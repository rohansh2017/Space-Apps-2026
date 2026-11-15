import { expect, test } from '@playwright/test'
import { expandPanels, shot } from './hud'

// Hardening: names, announcements, focus, Escape, screen-reader text, and input errors.
test('finder: unique button names, announcement, focus on the results', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await expect(page.getByTestId('result').first()).toBeVisible({ timeout: 15_000 }) // region loads + search, under parallel load
  await expect(page.getByTestId('announcer')).toContainText(/Search finished: \d+ alternatives ranked, \d+ meet every constraint/)
  await expect(page.getByRole('heading', { name: 'Alternatives' })).toBeFocused()
  const names = await page.getByTestId('result').getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')))
  expect(names.length).toBeGreaterThan(1)
  expect(new Set(names).size).toBe(names.length) // every button has its own name
  expect(names.filter((n) => n?.startsWith('Open in 3D'))[0]).toMatch(/^Open in 3D: #1, /) // the visible text stays the start of the name
  // editing a constraint marks the results out of date instead of deleting them
  await page.getByLabel('Max continuous darkness').fill('60')
  await expect(page.getByTestId('results-stale')).toBeVisible()
  await expect(page.getByTestId('announcer')).toContainText('out of date')
  await page.getByTestId('results-stale').scrollIntoViewIfNeeded()
  await page.screenshot(shot('17-results-out-of-date'))
})

test('constraints: out-of-range input shows an error and keeps the last valid value', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  const dark = page.getByLabel('Max continuous darkness')
  await dark.fill('900')
  await expect(dark).toHaveValue('900') // what was typed stays visible
  await expect(dark).toHaveAttribute('aria-invalid', 'true')
  const error = page.getByTestId('constraint-error')
  await expect(error).toContainText('900 hours is outside the allowed range: enter 0 to 720 hours.')
  await expect(error).toContainText('The search keeps using 80 hours.')
  await dark.scrollIntoViewIfNeeded()
  await page.screenshot(shot('16-constraint-error'))
  expect(await dark.getAttribute('aria-describedby')).toBe(await error.getAttribute('id'))
  await page.getByRole('button', { name: 'Static lander' }).click() // a preset replaces the bad entry
  await expect(dark).toHaveValue('80')
  await expect(error).toHaveCount(0)
  await dark.fill('')
  await expect(page.getByTestId('constraint-error')).toContainText('Enter a number from 0 to 720 hours.')
  await dark.fill('96')
  await expect(page.getByTestId('constraint-error')).toHaveCount(0)
})

test('tour takes focus, closes on Escape and returns focus; glossary text is readable', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByTestId('view')).toContainText('Plan:')
  await page.getByRole('button', { name: 'Explorer' }).click()
  const term = page.getByTestId('term').first()
  const tipId = (await term.getAttribute('aria-describedby'))!
  expect((await page.locator(`[id="${tipId}"]`).textContent())!.length).toBeGreaterThan(40)
  await page.getByRole('button', { name: 'Start tour' }).click()
  await expect(page.getByTestId('tour')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('tour')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Start tour' })).toBeFocused()
  // keyboard through the tour: Next keeps focus as it turns into Finish
  await page.getByRole('button', { name: 'Start tour' }).click()
  const next = page.getByTestId('tour').getByRole('button', { name: 'Next' })
  await next.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('tour').getByRole('button', { name: 'Finish' })).toBeFocused()
})

test('scrubber speaks its date, not a bare number', async ({ page }) => {
  await page.goto('/')
  await expandPanels(page)
  await expect(page.getByRole('slider', { name: /^Lunar day/ })).toHaveAttribute('aria-valuetext', /^2026-11-19 00:00 UTC, landing plus 0 hours$/)
})

test('a failed search is reported in place and the app keeps working', async ({ page }) => {
  await page.route('**/data/masks/haworth.bin', (route) => route.fulfill({ status: 503, body: 'down' }))
  await page.goto('/')
  await expandPanels(page)
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await expect(page.getByTestId('finder-error')).toContainText('The search failed')
  await expect(page.getByTestId('view')).toContainText('Plan: Shackleton rim') // the rest of the app is still there
  await expect(page.getByRole('button', { name: 'Find alternatives' })).toBeEnabled()
})
