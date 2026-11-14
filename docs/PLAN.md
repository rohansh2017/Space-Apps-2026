# Plan

Phases and exit gates are copied from `docs/spec/SPEC.md`. Tick only after verification.

## P0 Setup

Exit: Skyfield returns Sun and Earth directions for one hour in MOON_ME_DE440_ME421 that match Horizons at one site, and the DEM opens in rasterio. **Met 2026-11-14** (see VALIDATION.md, PROGRESS.md).

- [x] Freeze data contracts (including constraints.schema.json and the room message) and metric definitions; commit mock files of those shapes
- [x] Repo with /build, /web, /api; Vite app and Python env run (no /api: see DECISIONS D2)
- [x] Cloudflare account, Worker project and R2 bucket created; an empty app deploys to a public URL; Gemini key stored as a Worker secret and one test call returns JSON
  - [x] Worker live at https://tranquility-base.rohansh2017.workers.dev with R2 bucket `tranquility-base-data` bound as `DATA`
  - [x] Both LOLA DEMs uploaded to R2 under `raw/` (team request)
  - [x] `GEMINI_API_KEY` stored as a Worker secret; one Interactions API call with the constraint schema returned JSON (made from the dev machine with the same key; the Worker route itself is P4)
- [x] Start downloads: LDEM_80S_20MPP_ADJ first (2.6 GB), then LDEM_80S_80MPP_ADJ, the slope map, de440s.bsp and the lunar kernels (all complete, hashes in DATA.md)
- [x] Finalize the curated site list with a source per site (Artemis region centers, 2022 benchmarks, CLPS, Apollo 11, 15 and 17)
  - 12 sites with a source each in `build/sites_src.json`; 5 Artemis III regions deferred because no coordinate has been published (DECISIONS D17)

## P1 Engine + skeletons

Exit (M1): Skyfield angles match Horizons within 0.1° at 3 sites; a real mask and track show in the panorama for one site. **Met 2026-11-14** (VALIDATION.md; `web/tests/screenshots/p1-*.png`).

- [x] A: Skyfield ephemeris files for 2026–2035; local-frame rotation; Python engine; topocentric check at 3 sites
- [x] B: stereographic conversion with tests; mask for one site on the 80 m DEM, then 20 m + 80 m (done for all 9 site grids)
- [x] C: scene from a mock heightmap: mesh, 2 m camera, directional light, look controls (built directly on the real heightmaps)
- [x] D: app shell with site list, time scrubber and panorama on mocks (runs on real data; `make data-fixtures` still gives mocks)

## P2 Core on real data

Exit (M2): a slipped-date scenario returns ranked alternatives in under 3 s and opens in 3D with HUD values equal to engine values.

- [ ] A: engine.ts + parity test; finder worker with run lengths and prefix sums
- [ ] B: masks for all curated sites and grids; heightmaps; grid snapping
- [ ] C: real heightmaps, silhouette ring, Earth sprite, HUD bound to the engine, shadows
- [ ] D: constraint panel with presets, ranked results, pass/fail chips, diff text, click-through to 3D

## P3 Complete demo

Exit (M3, cut line): all seven objectives shown in the deployed app.

- [ ] A: lit/dark validation against Quickmap and PGDA; numbers for the validation slide
- [ ] B: custom-coordinate snapping in the UI; slope grid ready; data files uploaded to R2 and loaded by region
- [ ] C: playback with trails; performance pass to 30 fps
- [ ] D: Planner/Explorer modes and labels, basic scenario matrix, deploy to Cloudflare with data served from R2

## P4 Should-haves (in this order)

Exit: someone outside the team completes the tour unaided.

- [ ] Side-by-side compare (F11), nudge control (F14), guided tour (F13)
- [ ] Mission room (F24): Durable Object with WebSocket sync of site, date and constraints; two browsers stay in step
- [ ] Gemini sentence entry (F21), then the horizon description (F22) if time remains
- [ ] Illumination map (F15), slope screening (F16), shareable URL (F17)

## P5 Submission

Exit: two full demo runs under 3 minutes, backup video recorded.

- [ ] One-page summary with a 3D screenshot; README with data credits and the non-goals
- [ ] Prize slides (Cloudflare products used; how Gemini is used); confirm each prize's submission steps
- [ ] Rehearse the script twice; record the backup video; bug bash on the deployed URL

Cut list: see SPEC.md, "Cut list".
