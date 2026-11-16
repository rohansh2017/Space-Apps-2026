import { defineConfig } from '@playwright/test'

// GPU=1 runs Chromium on the machine's real GPU (Metal on macOS, Direct3D 11 on Windows, the default backend elsewhere)
// instead of software rendering: `make perf` uses it for the frame rate.
const angle = process.platform === 'darwin' ? ['--use-angle=metal'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : []
const gpu = process.env.GPU ? { channel: 'chromium', launchOptions: { args: [...angle, '--enable-gpu', '--ignore-gpu-blocklist'] } } : {}

// BASE_URL=https://... runs the same tests against a deployed site instead of a local build (`make e2e-live`).
const baseURL = process.env.BASE_URL ?? 'http://localhost:4173'

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL, viewport: { width: 1200, height: 1000 }, ...gpu },
  expect: { timeout: process.env.BASE_URL ? 15_000 : 5_000 }, // a deployed site answers over the network
  timeout: 60_000, // per test: live runs download 5 m heightmaps from R2; local runs share the CPU between five software-WebGL browsers
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: baseURL, reuseExistingServer: true, timeout: 120_000 },
})
