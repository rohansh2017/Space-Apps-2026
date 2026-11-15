import { expect, test } from '@playwright/test'
import { shot } from './hud'

// Needs the Worker (Durable Object), not the Vite preview: `make e2e-room` (wrangler dev) or `make e2e-live`.
test.skip(!process.env.ROOM_TEST, 'needs the Worker: run via make e2e-room or make e2e-live')

test('F24: two browsers in one mission room stay in step, and a late joiner gets the latest state', async ({ browser }) => {
  // every assertion here waits on a round trip through the Worker, and a live Durable Object may start cold
  test.setTimeout(90_000)
  test.slow()
  const a = await (await browser.newContext()).newPage()
  await a.goto('/')
  await expect(a.getByTestId('view')).toContainText('Plan: Shackleton rim')
  await a.getByRole('button', { name: 'Start mission room' }).click()
  const link = await a.getByTestId('room-link').inputValue()
  expect(link).toMatch(/[?&]room=tb-[a-z0-9]{6}(&|$)/) // F17 adds site/t/mode params after it

  const b = await (await browser.newContext()).newPage()
  await b.goto(link)
  await expect(a.getByTestId('room-count')).toHaveText('2 connected')
  await expect(b.getByTestId('room-count')).toHaveText('2 connected')

  // A picks another site: B follows
  await a.getByRole('combobox', { name: 'Site' }).selectOption('connecting-ridge')
  await expect(b.getByTestId('view')).toContainText('Plan: Connecting Ridge')
  // B slips the date and edits a constraint: A follows
  await b.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await expect(a.getByTestId('view')).toContainText('2026-12-01 00:00 UTC landing')
  await b.getByLabel('Max continuous darkness').fill('60')
  await expect(a.getByLabel('Max continuous darkness')).toHaveValue('60')
  // each browser computed its own view: HUDs agree
  await expect(b.getByTestId('hud-sun-el')).toHaveText((await a.getByTestId('hud-sun-el').textContent())!)
  await b.waitForTimeout(1200)
  await b.screenshot(shot('13-mission-room'))

  // a late joiner receives the room's latest state
  const c = await (await browser.newContext()).newPage()
  await c.goto(link)
  await expect(c.getByTestId('view')).toContainText('Plan: Connecting Ridge')
  await expect(c.getByTestId('view')).toContainText('2026-12-01 00:00 UTC landing')
  await expect(c.getByLabel('Max continuous darkness')).toHaveValue('60')
  await expect(a.getByTestId('room-count')).toHaveText('3 connected')

  // leaving the room keeps the local state and stops syncing
  await c.getByRole('button', { name: 'Leave room' }).click()
  await expect(c.getByTestId('room-count')).toHaveCount(0)
  await expect(a.getByTestId('room-count')).toHaveText('2 connected')
})
