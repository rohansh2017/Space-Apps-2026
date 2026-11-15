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
- `/data/*`, `/room/*` and `/api/*` are in `run_worker_first`: anything else is served as a static asset and never reaches the Worker.
- `worker/gemini.js` (`POST /api/constraints`, F21) and `worker/describe.js` (`POST /api/describe`, F22) call Gemini with the `GEMINI_API_KEY` secret; the browser validates every reply (`src/gemini.ts`, `src/describe.ts`) and has a fallback.
- 3D: `src/starfield.ts` draws BSC5 stars rotated per hour by `engine.skyMatrix`; the horizon ring is lit from `ridges/{region}.bin` crest normals; `src/regolith.ts` is the illustrative sub-1.5 m soil and ring texture. Anything invented must be named in the footer.
