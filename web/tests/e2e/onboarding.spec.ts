import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { shot } from './hud'

const coach = (page: Page) => page.getByTestId('coach')
const atStep = (page: Page, id: string) => expect(coach(page)).toHaveAttribute('data-step', id, { timeout: 15_000 })
/** The card glides to its next spot (0.25 s): give it a moment to stop before a screenshot (a visual aid, never a failure). */
const settled = async (page: Page, name: string) => {
  let last: { x: number; y: number } | null = null
  await expect.poll(async () => {
    const b = await coach(page).boundingBox()
    const still = !!b && !!last && Math.abs(b.x - last.x) <= 1 && Math.abs(b.y - last.y) <= 1
    last = b
    return still
  }, { intervals: [150], timeout: 10_000 }).toBe(true).catch(() => undefined)
  await page.screenshot(shot(name))
}
/** A real first-time visitor: Playwright's navigator.webdriver would otherwise keep the tour shut. */
const asPerson = (page: Page) => page.addInitScript(() => Object.defineProperty(navigator, 'webdriver', { get: () => false }))

test('F28: the quick tour walks four real actions, each step moving on by itself', async ({ page }) => {
  await page.goto('/?tour=1')
  await atStep(page, 'fly')
  await expect(coach(page)).toContainText('Welcome to Tranquility Base')
  await expect(page.getByTestId('coach-spot')).toBeVisible() // the ring is on the current site's pin
  await settled(page, '28-tour-1-fly')
  // time only the tour itself (the user's clicks and the app's responses), not the screenshots
  const times: string[] = []
  let total = 0
  const timed = async (name: string, act: () => Promise<void>, next: string) => {
    const t = Date.now()
    await act()
    await atStep(page, next)
    const s = (Date.now() - t) / 1000
    total += s
    times.push(`${name} ${s.toFixed(1)} s`)
  }
  await timed('fly', () => page.locator('[data-tour="site-pin"]').click(), 'sun') // the real pin, through the ring
  await settled(page, '28-tour-2-sun')
  await timed('play', () => page.locator('[data-tour="play"]').click(), 'stand')
  await timed('stand', () => page.locator('[data-tour="stand"]').click(), 'find')
  await settled(page, '28-tour-4-find')
  await timed('find', () => page.locator('[data-tour="find"]').click(), 'end')
  await expect(page.getByTestId('coach-spot')).toHaveCount(0) // the closing card is centred, with nothing ringed
  await settled(page, '28-tour-5-end')
  await coach(page).getByRole('button', { name: 'Finish' }).click()
  await expect(coach(page)).toHaveCount(0)
  // logged, not asserted: on an idle machine the four actions take about 10 s of app time (D65), but this number
  // tracks the machine's load (it reached 29 s while OneDrive synced the test output)
  console.log(`TOUR (software WebGL): ${times.join(', ')}; total ${total.toFixed(1)} s`)
})

test('F28: Skip moves on without the action; Escape ends it; Quick tour reopens it', async ({ page }) => {
  await page.goto('/?tour=1')
  await atStep(page, 'fly')
  await coach(page).getByRole('button', { name: 'Skip' }).click()
  await atStep(page, 'sun')
  await page.keyboard.press('Escape')
  await expect(coach(page)).toHaveCount(0)
  await page.getByTestId('quick-tour').click()
  await atStep(page, 'fly')
  await coach(page).getByRole('button', { name: 'End the tour (Escape)' }).click()
  await expect(coach(page)).toHaveCount(0)
})

test('F28: it opens by itself on a first visit, only once, and never over a shared link', async ({ page, context }) => {
  await asPerson(page)
  await page.goto('/')
  await atStep(page, 'fly')
  await page.keyboard.press('Escape')
  await page.goto('/') // the same browser comes back: no tour
  await expect(page.getByTestId('view')).toContainText('Plan:')
  await expect(coach(page)).toHaveCount(0)

  const visitor = await context.browser()!.newContext() // someone new, opening a teammate's link
  const shared = await visitor.newPage()
  await asPerson(shared)
  await shared.goto('/?site=haworth')
  await expect(shared.getByTestId('view')).toContainText('Plan: Haworth')
  await expect(coach(shared)).toHaveCount(0)
  await visitor.close()
})

test('F28: on a phone the card docks full width, clear of its target, and the first step still works', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?tour=1')
  await atStep(page, 'fly')
  await expect(page.getByTestId('coach-spot')).toBeVisible()
  const card = (await coach(page).boundingBox())!
  const pin = (await page.locator('[data-tour="site-pin"]').boundingBox())!
  expect(card.x).toBeGreaterThanOrEqual(15)
  expect(card.x + card.width).toBeLessThanOrEqual(390 - 15)
  // docked full width at the edge away from the pin, so it never covers the control it asks for
  expect(card.y + card.height <= pin.y || card.y >= pin.y + pin.height).toBe(true)
  await settled(page, '28-tour-phone')
  // any pin counts. At phone width the Moon view's own bar covers the Shackleton pin (phone layout is the open
  // PLAN item "Adapt (phones)"; only Mons Mouton is clear at 390 px), so take that one
  await page.getByTestId('moon-pin-im2-mons-mouton').click()
  await atStep(page, 'sun')
})
