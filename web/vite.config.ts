import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  // `make dev-api` runs the Worker (Gemini routes, mission room) on 8788; plain `make dev` without it reports that in place
  server: { proxy: { '/api': 'http://localhost:8788', '/room': { target: 'ws://localhost:8788', ws: true } } },
  test: { include: ['src/**/*.test.ts', 'worker/**/*.test.js'] },
})
