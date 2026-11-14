import { expect, test } from '@playwright/test'

// Calls the real Worker route (Gemini). Needs a deployment with the GEMINI_API_KEY secret: `make e2e-live`.
test.skip(!process.env.GEMINI_TEST, 'needs the deployed Worker with the Gemini secret (make e2e-live)')

test('F21 live: the demo sentence fills the panel with schema-valid values', async ({ page }) => {
  test.slow()
  await page.goto('/')
  await expect(page.getByTestId('view')).toContainText('Plan:')
  await page.getByPlaceholder(/survive 4 days of dark/).fill('survive 4 days of dark, talk to Earth half the time')
  await page.getByRole('button', { name: 'Interpret with Gemini' }).click()
  const suggestion = page.getByTestId('suggestion')
  await expect(suggestion).toBeVisible({ timeout: 45_000 })
  await expect(suggestion).toContainText('Max continuous darkness: 96 hours')
  await expect(suggestion).toContainText('Min Earth visibility: 50 %')
  await expect(page.getByTestId('suggestion-rejected')).toHaveCount(0)
  await page.getByRole('button', { name: 'Apply to the panel' }).click()
  await expect(page.getByLabel('Max continuous darkness')).toHaveValue('96')
  await expect(page.getByLabel('Min Earth visibility')).toHaveValue('50')
})
