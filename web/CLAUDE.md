# web/ conventions

- React + TypeScript (strict) + Vite. Lint with `npm run lint` (oxlint), typecheck with `tsc -b`.
- `public/data/` holds generated contract files only. Never hand-edit them, except
  `constraints.schema.json`, which is authored there and is the single schema source.
- `src/engine/engine.ts` (P1+) is pure: no DOM, no React, no globals. HUD numbers come from it.
- No runtime network calls except the optional Gemini routes and the mission room.
- Deploy: `make deploy` from the repo root (uploads data to R2 with `scripts/upload-data.sh`, then `wrangler deploy`).
- `Scene3D.tsx` and `SiteMap.tsx` are memoised; pass them stable props so playback does not redraw them needlessly.
- `GPU=1 npx playwright test` runs Chromium on the real GPU (used by `make perf`); the default is software rendering.
