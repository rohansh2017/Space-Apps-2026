# Progress (append-only)

## 2026-11-14 13:35 EST — P0 setup

**Changed**
- Branch `build/tranquility-base`. Spec converted to `docs/spec/SPEC.md` (all 23 pages; last section "Reconciliation" present). Memory files created.
- `build/`: `horizonwalk.ephem` (Sun/Earth from the Moon's centre in MOON_ME_DE440_ME421), `horizonwalk.geo` (site frame, az/el with parallax, stereographic), Horizons validation script with cached responses, synthetic fixture generator.
- `web/`: empty Vite + React + TS shell with the screening-grade footer; `wrangler.jsonc`; deployed to https://tranquility-base.rohansh2017.workers.dev (HTTP 200).
- Data contracts frozen (CLAUDE.md) with synthetic mock files in `web/public/data/` and `constraints.schema.json`.
- Downloads: both LOLA DEMs, de440s.bsp and both lunar kernels complete with SHA-256 in DATA.md. The 20 m DEM transfer was dropped once by the server and resumed. Slope map (3.8 GB) still downloading.
- `build/sites_src.json`: 12 sites, each with a source.

**Exit gate: met**
- `make validate`: Apollo 11, 24 hourly steps from 2026-11-20: Sun and Earth az/el within 0.00001° of Horizons (target 0.1°).
- Both DEMs open in rasterio with the expected projection (DATA.md).

**Test status**: `make check` passes: ruff clean, oxlint clean, tsc clean, pytest 8 passed, vitest has no tests yet.

**Blockers (need a human)**
1. R2 is not enabled on the Cloudflare account (wrangler error 10042), so no bucket and no DEM upload yet. The 2.7 GB DEM is over wrangler's single-upload limit and will also need an R2 S3 API token (or a multipart upload Worker).
2. No Gemini API key, so the Worker secret and test call are not done.
3. Five Artemis III regions have no sourced centre coordinate (DECISIONS D7).

**Next**: finish the three blocked P0 items once unblocked, record the slope map hash, then P1 (ephemeris files for 2026–2035, Horizons at 3 sites, first real mask on the 80 m DEM, panorama on mocks).

## 2026-11-14 14:05 EST — P0 loose ends closed, P1 complete

**P0 loose ends**
- Slope map download finished; hash in DATA.md.
- Cloudflare: R2 enabled by the team. Bucket `tranquility-base-data` created and bound to the Worker as `DATA`; both LOLA DEMs uploaded under `raw/` (sizes verified with `aws s3 ls`). Cloudflare's agent setup installed the `cloudflare` Claude Code plugin.
- Gemini: key already in `.env`; stored as Worker secret `GEMINI_API_KEY`. One Interactions API call (`gemini-4-hydrogen`, constraint schema as response format) for "survive 4 days of dark, talk to Earth half the time" returned `{"max_continuous_dark_hours": 96, "min_earth_visible_pct": 50}`. The call was made from the dev machine; the Worker route is P4.
- Still open: 5 Artemis III regions without a sourced coordinate (DECISIONS D7).

**P1 changed**
- `make data`: real ephemeris 2026–2035, horizon masks (20 m + 80 m DEMs, to 300 km), slopes and heightmaps for all 9 polar site grids, 3,969 points, in about 12 s. `web/public/data` is now real except `tour.json`.
- Python reference engine (`engine.py`), numba masks (`masks.py`), shared contract writers (`export.py`).
- `engine.ts` (pure) with parity fixture `shared/fixtures/engine_cases.json`.
- App shell: site list, UTC picker, lunar-day scrubber, readout from the engine, Canvas panorama with Sun and Earth tracks, r3f scene on the real heightmap with a 2 m camera, Sun light and look controls. Deployed.

**Exit gate M1: met**
- `make validate`: 3 sites (Apollo 11, Shackleton rim, IM-2 Mons Mouton), 720 hourly steps from 2026-11-20, computed from the shipped Float32 table: max error 0.00068° (Sun elevation; the ignored solar parallax), target 0.1°.
- Real mask and tracks in the panorama: `web/tests/screenshots/p1-shackleton.png`, `p1-shackleton-plus300h.png`, `p1-connecting-ridge.png` (viewed; labels readable, readout matches the engine, 3D not empty).

**Test status**: `make check` passes: ruff, oxlint, tsc clean; pytest 15 passed; vitest 6 passed (3 parity cases, 144 rows); Playwright 1 passed.

**Known gaps / next (P2)**: run lengths, events, metrics and finder in both engines; constraint panel; HUD; Earth sprite, silhouette ring, shadows; grid snapping. The 3D view is very dark at grazing Sun angles (no fill light or shadows yet). The JS bundle is 1.2 MB before splitting.

## 2026-11-14 14:20 EST — wrap-up and push

- Site list closed at 12 sites; five Artemis III regions deferred (D17). Gemini skill/MCP not installed (D18).
- README now holds the launch-and-test instructions used for the rest of the project.
- Branch `build/tranquility-base` pushed to `origin`. P0 and P1 are complete; next is P2.

## 2026-11-14 15:30 EST — P2 closed, P3 built (not deployed)

Work moved to a second machine (Apple Silicon). Python env rebuilt with `uv sync`; raw data re-downloaded; `make data` reproduces the committed masks byte for byte (only last-digit float changes in `sites.json`).

**P2 closed**
- The finder searches forward only from the planned date (team decision, D19); before, a slipped date returned alternatives up to 30 days earlier.
- Removed a leftover debug test that wrote to another machine's temp path.
- Gate M2 is asserted by `demo.spec.ts` (finder 45 to 70 ms in the browser for 325 points; HUD equals engine at every step).

**P3 changed**
- A: `validate_horizons.py` now covers six sites (Apollo 11, 15, 17, Connecting Ridge, Shackleton rim, IM-2): max error 0.00068 deg. New `validate_illumination.py`: our ten-year sunlit % at all 3,969 grid points vs the PGDA average illumination maps: Pearson r 0.95 to 0.99 per site, grid means within 2 points; Connecting Ridge is third best-lit of nine.
- B: custom latitude/longitude entry and map clicks (polar map and per-site grid map on LOLA hillshades from `make data`), snapped to the nearest grid point with the distance shown, and a clear message outside the regions. Worker route serves `/data/*` from R2, bundled copy as fallback; `make deploy` uploads the files first.
- C: lunar-day playback (708 h in 20 s) with Sun and Earth trails in 3D and the panorama. First visual pass on the 3D view: procedural regolith detail, stars, Sun glare, Earth with the correct phase, shaded horizon ring (all labelled illustrative in the footer, D22). `make perf` now measures frame rate on the real GPU.
- D: Planner/Explorer toggle (plain-English summary, HUD sentence, battery icon, glossary tooltips from a real `tour.json`), mission-window summary, scenario matrix (9 sites x 60 daily or 53 weekly landing dates, four metrics, click to open).
- UI restyled (layout, HUD, controls).

**Exit gate M3: not met.** Everything above passes locally, but `make deploy` was not run from this session (the permission system blocked it), so the live URL still serves the P1 build and R2 holds only the raw DEMs.

**Test status**: `make check` passes: ruff, oxlint, tsc clean; pytest 20 passed; vitest 24 passed; Playwright 5 passed. `make validate` exits 0. `make perf`: finder 966 ms for 5,000 candidates x 60 days; 60 fps on an M1 Pro (headless software rendering gives 13 fps, which is not a laptop GPU number); first load 5.1 MB.

**Blockers (need a human)**
1. Run `make deploy`, then confirm `curl -sI <live>/data/sites.json | grep x-data-source` says `r2`.
2. Quickmap lit/dark comparison by hand (P3 A).
3. Frame rate on a typical non-Apple laptop is unmeasured.

**Known gaps / next**: P4 in the spec's order: side-by-side compare, nudge, guided tour (the tour text is written; the UI is not), mission room, Gemini sentence entry, illumination map, slope check, shareable URL. The regolith texture still reads a little like ripples; a real albedo/normal set and a larger terrain patch would be the next visual step.

## 2026-11-14 17:35 EST — end-to-end check on the first machine, P3 closed

Pulled the teammate's "Phase 3 nearly done" commit onto the Intel Mac that did P0–P2. `uv sync`, `npm install`; the two PGDA illumination maps were missing here and were downloaded (hashes match DATA.md).

**End-to-end check, all green on this machine**
- `make check`: ruff, oxlint, tsc clean; pytest 20 passed; vitest 24 passed; Playwright 5 passed. Only diff afterwards: last-digit float noise in the two parity fixtures (same as the teammate saw on Apple Silicon) and regenerated screenshots.
- `make validate`: exit 0; Horizons max error 0.00068° at six sites; PGDA Pearson r 0.95–0.99 at nine sites; Connecting Ridge 3rd best-lit.
- `make perf`: finder 852 ms (5,000 candidates × 60 days); 60 fps during playback (Apple M5, Metal); first load 3.91 MB + 0.65 MB per region.
- Screenshots 1–9 viewed: HUD, chips, summary tiles, maps, matrix and Explorer labels are readable; nothing overlaps; the 3D view is no longer dark at grazing Sun.

**Deployed (teammate's blocker #1)**
- `make deploy`: 58 data objects uploaded to R2, Worker published. Live: `/data/sites.json`, `/data/masks/*.bin`, `/data/ephemeris/*.bin` answer with `x-data-source: r2`; `/data/raw/...` is not served (falls through to the SPA page).
- New `make e2e-live` runs the five browser tests against the live URL: 5 passed, header `r2`. Documented in README.

**Exit gate M3: met.** All seven objectives are in the deployed app (F1–F10, F12 live; F1–F9 exercised by the browser tests on the live build).

**Still open from P3**: Quickmap lit/dark comparison by hand (judges' Q&A); frame rate on a non-Apple laptop (only Apple GPUs measured: M1 Pro and M5, both 60 fps).

**Next**: P4 in the spec's order: side-by-side compare (F11), nudge (F14), guided tour (F13, text exists), mission room (F24), Gemini sentence entry (F21), then F15–F17.

## 2026-11-14 18:15 EST — P4 first group: side-by-side, nudge, tour

**Changed**
- F11 `Compare.tsx`: when a finder result is opened, the plan's own day is computed alongside (`dayOf`) and shown as paired panoramas, metric tiles and chips, scrubbed together (D27).
- F14 nudge row under the scrubber: 500 m N/E/S/W via `engine.nudgeNeighbour` (unit-tested) and ±1 day; `Summary` shows per-tile deltas since the last nudge with a short animation (D26).
- F13 `Tour.tsx`: three steps from `tour.json`, Earth-sunrise sketch on step 1, playback on step 2; "Start tour" appears in Explorer mode (D28).
- `web/tests/e2e/p4.spec.ts` covers all three; screenshots 10–12 viewed (layout holds, nothing overlaps).

**Test status**: tsc, oxlint clean; vitest 25 passed; Playwright 8 passed. Deployed with `make deploy`; `make e2e-live` result below.

**Next**: mission room (F24, Durable Object), then Gemini sentence entry (F21), then F15–F17. Still needs a person: outsider tour test (P4 exit), Quickmap comparison, non-Apple frame rate.

## 2026-11-14 18:55 EST — P4: mission room (F24)

**Changed**
- `web/worker/room.js`: `MissionRoom` Durable Object (SQLite class, WebSocket hibernation API). Stores the latest state, sends it to late joiners, relays changes, broadcasts a presence count. Shape-checks messages only (D29).
- `web/worker/index.js`: `/room/{id}` → `env.ROOM.getByName(id)`; `wrangler.jsonc` adds the binding, migration `v1` and `/room/*` to `run_worker_first`.
- `web/src/room.ts` + App wiring: Start/Leave mission room, shareable `?room=` link, "N connected"; incoming state validated against the schema and known sites/points/dates; no echo.
- Room message contract gains `point_index` (CLAUDE.md, fixture, `make_fixtures.py`).
- `make e2e-room` (wrangler dev on 8788) runs `room.spec.ts`: three browsers, cross-direction sync of site, date and a constraint, late joiner catch-up, leave. Added to `make check`; `make e2e-live` runs it against the deployed Worker.

**Found while testing**: a browser `close()` arrives as code 1005 and `ws.close(1005)` throws in the DO, which skipped the presence broadcast; presence is now sent first.

**Test status**: `make check` passes: ruff, oxlint, tsc clean; pytest 20; vitest 25; Playwright 8 + room 1. Deploy and `make e2e-live` below.

**Next**: Gemini sentence entry (F21) as a Worker route with the schema as response format, then F15 illumination map, F16 slope check, F17 shareable URL.

## 2026-11-14 19:35 EST — P4: Gemini sentence entry (F21)

**Changed**
- `web/worker/gemini.js`: `POST /api/constraints` → Gemini Interactions API with `constraints.schema.json` (read from the Worker's own assets) as the response schema; 300-char and 10/min caps; key from the `GEMINI_API_KEY` secret (D31).
- `web/src/gemini.ts` `parseSuggestion`: strict validation, unknown fields and out-of-range values listed as rejected (unit-tested). `SentenceEntry.tsx` under the constraint panel: proposal shown as generated, applied only on "Apply to the panel"; the finder still runs only on its own button.
- Tests: `gemini.test.ts` (3), `p4.spec.ts` F21 with a mocked route (confirm flow, rejection list), `gemini.spec.ts` against the real route in `make e2e-live`.
- `scripts/wrangler.sh` reads the renamed `.env` token (D32).

**Test status**: `make check` passes (pytest 20, vitest 28, Playwright 9 + room 1; 2 live-only tests skipped locally). Deploy and `make e2e-live` below.

**Next**: F15 illumination map, F16 slope check vs the LOLA slope map, F17 shareable URL; then P5 submission material. F22 (horizon description) stays unbuilt unless time remains (first on the cut list).

## 2026-11-14 20:20 EST — P4: illumination map (F15), slope check (F16), shareable URL (F17)

**Changed**
- F15: `App.tsx` computes sunlit % at all 441 grid points of the selected region over the mission window; `SiteMap.tsx` draws them as 500 m cells over the hillshade with the matrix's ramp (`src/ramp.ts`) and a legend (D33).
- F16: `build/scripts/validate_slopes.py` in `make validate`: our slopes vs the LOLA slope map, r 0.994–0.999, mean abs diff 0.26–0.33° at nine sites (D34). Slope screening itself was already in the finder.
- F17: `src/share.ts` (unit-tested) encodes site, point, time, changed constraints and mode into the URL; links restore the state through the same validation as room messages; Copy link button (D35).
- `room.spec.ts` regex updated for the extra URL params.

**Test status**: `make check` passes (pytest 20, vitest 30, Playwright 11 + room 1); `make validate` exit 0 (three sections). Screenshot 15 viewed.

**P4 state**: every item built except the exit test (outsider completes the tour) and F22 (could-have). Deploy and `make e2e-live` below, then P5 submission material.
