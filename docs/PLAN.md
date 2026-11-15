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
  - 2026-11-15: Apollo 11, 15 and 17 removed from the app at the team's request (D44); 9 sites remain, all with terrain. They stay in `make validate`.

## P1 Engine + skeletons

Exit (M1): Skyfield angles match Horizons within 0.1° at 3 sites; a real mask and track show in the panorama for one site. **Met 2026-11-14** (VALIDATION.md; `web/tests/screenshots/p1-*.png`).

- [x] A: Skyfield ephemeris files for 2026–2035; local-frame rotation; Python engine; topocentric check at 3 sites
- [x] B: stereographic conversion with tests; mask for one site on the 80 m DEM, then 20 m + 80 m (done for all 9 site grids)
- [x] C: scene from a mock heightmap: mesh, 2 m camera, directional light, look controls (built directly on the real heightmaps)
- [x] D: app shell with site list, time scrubber and panorama on mocks (runs on real data; `make data-fixtures` still gives mocks)

## P2 Core on real data

Exit (M2): a slipped-date scenario returns ranked alternatives in under 3 s and opens in 3D with HUD values equal to engine values. **Met 2026-11-14** (`web/tests/e2e/demo.spec.ts` asserts it; PERF.md).

- [x] A: engine.ts + parity test; finder worker with run lengths and prefix sums
- [x] B: masks for all curated sites and grids; heightmaps; grid snapping
- [x] C: real heightmaps, silhouette ring, Earth sprite, HUD bound to the engine, shadows
- [x] D: constraint panel with presets, ranked results, pass/fail chips, diff text, click-through to 3D

## P3 Complete demo

Exit (M3, cut line): all seven objectives shown in the deployed app. **Met 2026-11-14 17:30** (`make deploy` run, `make e2e-live` passes 5/5 against the live URL with `x-data-source: r2`; PROGRESS.md).

- [ ] A: lit/dark validation against Quickmap and PGDA; numbers for the validation slide
  - [x] PGDA, scripted: nine sites, Pearson r 0.95 to 0.99 (VALIDATION.md); Horizons extended to six sites
  - [ ] Quickmap, by hand, for the judges' Q&A (needs a person)
- [x] B: custom-coordinate snapping in the UI; slope grid ready; data files uploaded to R2 and loaded by region
  - [x] Custom coordinates and map clicks snap to the grid and show the snap distance
  - [x] Slope grid ready (in the finder since P2; the check against the LOLA slope map is F16, P4)
  - [x] Worker serves `/data/*` from R2 with the bundled copy as fallback (checked with `wrangler dev --local`)
  - [x] Data files uploaded to R2 (`make deploy`, 2026-11-14 17:20; 58 objects under the contract paths)
- [x] C: playback with trails; performance pass to 30 fps (60 fps on an M1 Pro, PERF.md)
- [x] D: Planner/Explorer modes and labels, basic scenario matrix, deploy to Cloudflare with data served from R2
  - [x] Planner/Explorer modes, labels and glossary tooltips; scenario matrix
  - [x] Deploy (`make deploy`), then check `x-data-source: r2` on the live URL (`make e2e-live`)

## P4 Should-haves (in this order)

Exit: someone outside the team completes the tour unaided.

- [x] Side-by-side compare (F11), nudge control (F14), guided tour (F13) — built and tested 2026-11-14 18:10 (`web/tests/e2e/p4.spec.ts`, screenshots 10–12). The phase exit (an outsider completes the tour unaided) still needs a person.
- [x] Mission room (F24): Durable Object with WebSocket sync of site, date and constraints; two browsers stay in step — 2026-11-14 18:50, `web/tests/e2e/room.spec.ts` (three browsers, late joiner, leave) via `make e2e-room` and `make e2e-live`
- [ ] Gemini sentence entry (F21), then the horizon description (F22) if time remains
  - [x] F21: Worker route `/api/constraints` with the schema as Gemini's response format; browser validates, user applies, finder never auto-runs (2026-11-14 19:30; `p4.spec.ts` mocked, `gemini.spec.ts` live)
  - [x] F22 horizon description: `/api/describe` from engine facts, number check, template fallback (2026-11-14 21:10; `p4.spec.ts` mocked, `gemini.spec.ts` live)
- [x] Illumination map (F15), slope screening (F16), shareable URL (F17) — 2026-11-14 20:10: sunlit % per grid cell on the region map (`p4.spec.ts` F15); slopes checked against the LOLA slope map in `make validate` (r ≥ 0.994, mean abs diff ≤ 0.33°); `?site&point&t&c&mode` links with Copy link (`p4.spec.ts` F17)

P4 items done except the exit test itself (an outsider completing the tour unaided) and F22 (could-have, cut-list item 1).

## P5 Submission

Exit: two full demo runs under 3 minutes, backup video recorded.

- [x] One-page summary with a 3D screenshot (`docs/ONE_PAGER.md`); README rewritten with data credits, architecture, validation and the non-goals (2026-11-14 20:40)
- [ ] Prize slides (Cloudflare products used; how Gemini is used); confirm each prize's submission steps
  - [x] Slide content in `docs/PRIZE_SLIDES.md`
  - [ ] Submission steps confirmed on the Space Apps NYC page (needs a person)
- [ ] Rehearse the script twice; record the backup video; bug bash on the deployed URL
  - [x] Script mapped to the UI in `docs/DEMO_SCRIPT.md`; `make e2e-live` is the automated bug bash (13 tests pass on the deployed URL)
  - [ ] Two rehearsals under 3 minutes and the recording (needs people)

Cut list: see SPEC.md, "Cut list".

## P6 Visual fidelity (team request, 2026-11-14, after P5)

Goal: replace illustrative 3D assets with real data where a source exists. Exit: the footer lists only what is still illustrative, `make check` passes, frame rate still ≥ 30 fps on our machines, and the new raw files are in R2.

- [x] Download the PGDA 78 5 m site DEMs (8 files, ~530 MB) and the Yale Bright Star Catalogue (BSC5, Harvard TDC copy of VizieR V/50); hashes in DATA.md; raw copies in R2 under `raw/`
- [x] Heightmaps from the 5 m DEMs (1024 × 1024 over 5 × 5 km, ~4.9 m per cell) where a 5 m file covers the patch; 20 m elsewhere (IM-2 Mons Mouton); `source` and `res_m` recorded per site
- [x] Remove the procedural soil relief on 5 m patches (real relief replaces it); keep it on 20 m patches and on the level-ground fallback, labelled
  - Reversed 2026-11-15 (D43): the 5 m ground looked unrealistically smooth; the sub-1.5 m texture is back on every patch, under the real relief
- [x] Real stars: BSC5 positions, magnitudes and B−V colours, oriented for the site and hour from an hourly ICRF→MOON_ME orientation table (new contract file); validated by rotating the Sun's ICRF direction onto the stored ephemeris vector
- [x] Footer, README, DECISIONS updated; screenshots viewed; `make perf` re-run (2026-11-14 23:30; D40, D41)
- [x] Distant ranges lit from LOLA crest slopes and the real Sun, with illustrative rock texture (2026-11-15, D45); Apollo sites removed from the app (D44)


## P7 UI redesign for the challenge objective (team request, 2026-11-15, branch `redesign/new-visual-identity`)

Goal: rapid, intuitive comparison of several scenarios, in full screen. Run through impeccable in this order: init, harden, clarify, delight, shape, layout, adapt, polish, critique. Exit: `make check` passes, screenshots viewed at desktop and phone widths, PR to `main` for the team.

- [x] PRODUCT.md (init); harden (D46); clarify (D47); delight (D48)
- [x] Shape + layout: full-screen layout, compare tray of plan + 3 pins in the share link, drawers, one-line footer with *About the data*, polar-light palette (D49)
- [x] Moon view: orbitable polar region with site pins, fly-down to the search grid, draggable landing point (D58)
- [x] Pins as snapshots, tray reorder, labelled band tab (D59); whole-Moon relief and 5 m site layer (D60)
- [x] Stars on the Moon view, Pole button everywhere, fewer clicks, Map drawer folded into the Moon view (D61); 20 m context maps around each site (D62)
- [ ] Adapt (phones)
- [x] Polish from the test screenshots (2026-11-15)
- [x] Critique against the comparison objective (25/40); its three P1s fixed: tray fits a 720p full screen, tray reads as a table, *Make this the plan* (D50)
