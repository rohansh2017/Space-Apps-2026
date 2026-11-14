import { test } from '@playwright/test'
test('dbg', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Landing date and time (UTC)').fill('2026-12-01T00:00')
  await page.getByRole('button', { name: 'Find alternatives' }).click()
  await page.getByTestId('result').first().getByRole('button', { name: 'Open in 3D' }).click()
  await page.waitForTimeout(1500)
  await page.locator('.viewport').screenshot({ path: '/private/tmp/claude-501/-Users-rohan116-Downloads-Space-Apps-2026/32f35620-c4f9-436b-948c-31fb2aa5a236/scratchpad/dbg.png' })
})
