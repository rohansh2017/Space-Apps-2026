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
- 3D: `src/starfield.ts` draws BSC5 stars rotated per hour by `engine.skyMatrix`; the horizon ring is lit from `ridges/{region}.bin` crest normals; `src/regolith.ts` is the illustrative sub-1.5 m soil and ring texture. Anything invented must be named in the footer's *About the data* dialog (`App.tsx`).
- Layout (D49): full-window grid in `index.css` (top bar, left rail, Plan side panel, the view's overlays, bottom band, one-line footer). Map, scenario matrix and mission room open in `Drawer`s; the compare tray (`Tray.tsx`) holds the plan plus up to `TRAY_MAX` pinned `ScenarioRef`s, which go in the share link as `pins`. Colours: gold only for sunlight, blue only for Earth, red/green only for pass/fail with words or icons.
- Moon view (D58): `MoonView.tsx` is the default stage; it and `Scene3D` replace each other (one WebGL context). `moon.ts` holds its pure geometry (MOON_ME ↔ three.js `(x, z, −y)`, trig-free stereographic, ray → grid, `gridStats`). Its bar is portalled into `.over` so no card covers it. Pins read one mask row per site via `loadSitePoint` (HTTP Range). Shader layers (D60): `globe.png` → `pole.png` → region map → the site heightmap shaded in the browser.
- Tray (D59): every column is a frozen `ScenarioRef`; *Pin this view* toggles the scenario in view; no live plan column (old `pins=plan` links become a snapshot on load).
- Accessibility conventions: one polite live region (`data-testid="announcer"`) for status messages, deliberately without `role` (tests count `role="status"`); result buttons carry `aria-label`s that start with their visible text; inline errors use `aria-describedby`/`aria-invalid`; failures are reported in place with a retry, never by replacing the whole app.
