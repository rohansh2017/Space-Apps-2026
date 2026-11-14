# web/ conventions

- React + TypeScript (strict) + Vite. Lint with `npm run lint` (oxlint), typecheck with `tsc -b`.
- `public/data/` holds generated contract files only. Never hand-edit them, except
  `constraints.schema.json`, which is authored there and is the single schema source.
- `src/engine/engine.ts` (P1+) is pure: no DOM, no React, no globals. HUD numbers come from it.
- No runtime network calls except the optional Gemini routes and the mission room.
- Deploy: `make deploy` from the repo root (uploads data to R2 with `scripts/upload-data.sh`, then `wrangler deploy`).
- `Scene3D.tsx` and `SiteMap.tsx` are memoised; pass them stable props so playback does not redraw them needlessly.
- `GPU=1 npx playwright test` runs Chromium on the real GPU (used by `make perf`); the default is software rendering.
- `worker/room.js` is the mission room Durable Object (`MissionRoom`, binding `ROOM`, SQLite migration `v1`). It relays state and computes nothing. `src/room.ts` is the client; `App.tsx` applies incoming state after validating it.
- `/data/*` and `/room/*` are in `run_worker_first`: anything else is served as a static asset and never reaches the Worker.
