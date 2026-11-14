import { defineConfig } from '@playwright/test'

// GPU=1 runs Chromium on the machine's real GPU (macOS Metal) instead of software rendering: `make perf` uses it for the frame rate.
const gpu = process.env.GPU ? { channel: 'chromium', launchOptions: { args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] } } : {}

export default defineConfig({
  testDir: 'tests/e2e',
  use: { baseURL: 'http://localhost:4173', viewport: { width: 1200, height: 1000 }, ...gpu },
  webServer: { command: 'npm run build && npx vite preview --port 4173 --strictPort', url: 'http://localhost:4173', reuseExistingServer: true, timeout: 120_000 },
})
