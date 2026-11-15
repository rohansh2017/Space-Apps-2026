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

## 2026-11-14 21:15 EST — P5 documents and F22

**Changed**
- P5: README rewritten to the brief's definition of done (what, quick start, architecture in five lines, validation table, credits, limits, synthetic-data statement, deploy); `docs/ONE_PAGER.md` with the 3D screenshot; `docs/DEMO_SCRIPT.md` mapped to the UI with Gemini example sentences; `docs/PRIZE_SLIDES.md` with the two slides' content and the submission checklist.
- F22 (could-have, built last as the brief requires): `describe.ts` facts/template/number check (unit-tested), `worker/describe.js` route, `HorizonText.tsx` under the panorama (D36). Browser tests cover the kept and the rejected case with a mocked route; `gemini.spec.ts` calls the real route.

**Test status**: `make check` passes (pytest 20, vitest 34, Playwright 12 + room 1). Deploy and `make e2e-live` below.

**Remaining, all need people**: outsider tour test (P4 exit), two timed rehearsals and the backup video (P5 exit), Quickmap comparison by hand, frame rate on a non-Apple laptop, prize submission steps on the event page. The stretch game (F20) is not built.

## 2026-11-14 21:45 EST — Final report

Live: https://tranquility-base.rohansh2017.workers.dev · branch `build/tranquility-base`, 15 commits, all pushed. `make check` and `make validate` pass; `make e2e-live` passes 15/15 against the deployment (data from R2, Durable Object room, both Gemini routes).

### 1. Requirement status

| ID | Requirement | Pri | Status |
| --- | --- | --- | --- |
| F1 | Curated sites, custom coordinates, map click, grid snap | M | done |
| F2 | UTC picker + lunar-day scrubber 2026–2035 | M | done |
| F3 | 3D scene: Sun/Earth at true az/el, shadows, silhouette ring | M | done (sub-20 m detail illustrative) |
| F4 | HUD with countdowns | M | done (HUD = engine, tested) |
| F5 | Horizon panorama with tracks | M | done |
| F6 | Constraint panel with presets | M | done |
| F7 | Finder: ranked dates and nearby points, pass/fail | M | done (forward-only slip, D19) |
| F8 | Plain-language difference | M | done |
| F9 | Planner / Explorer modes | M | done |
| F23 | Cloudflare: Workers + R2 by region | M | done |
| F10 | Scenario matrix | S | done |
| F11 | Side-by-side | S | done (paired panoramas) |
| F12 | Playback with trails | S | done |
| F13 | Guided tour | S | done; outsider test pending |
| F14 | Nudge | S | done (500 m step, D26) |
| F15 | Illumination map | S | done |
| F16 | Slope screening + LOLA check | S | done |
| F17 | Shareable URL | S | done |
| F21 | Gemini sentence → constraints | S | done |
| F24 | Mission room | S | done |
| F22 | Gemini horizon description | C | done |
| F18 | Array presets | C | not built (engine supports deck mode) |
| F19 | CSV/PDF export | C | not built |
| F20 | Night Survivor game | C | not built |

Success metrics: SM1 done, SM2 done (0.0007°), SM3 done (0.86 s), SM4 partial (60 fps on Apple GPUs only), SM5 and SM6 need people, SM7 done.

### 2. Validation and performance

- Engine vs JPL Horizons: six sites, 720 hourly steps, max error 0.00068° (Sun elevation; the ignored solar parallax). Target < 0.1°.
- Sunlit % vs PGDA average illumination: nine sites × 441 points, Pearson r 0.95–0.99, grid means within 2 points; Connecting Ridge third best-lit.
- Slopes vs LOLA slope map: r 0.994–0.999, mean abs diff 0.26–0.33°.
- Python vs TypeScript engine: 144 angle rows within 1e-4°, 15 metric windows identical.
- Finder: 5,000 candidates × 60 days, 305,378 pairs, 0.85–0.97 s (target < 3 s); the real demo search: ~40 ms.
- 3D: 60 fps during playback on Apple M1 Pro and M5 (target ≥ 30 fps on a typical laptop; non-Apple unmeasured).
- Load: 1.23 MB app + 3.91 MB data at start, 0.65 MB per region on demand (target < 10 MB).

### 3. Fallbacks and synthetic data

- No synthetic data anywhere in the deployed app. `make data-fixtures` exists for development only and marks its output.
- `/data/*` falls back from R2 to the bundled copy if R2 misses (D24); the live header says `r2`.
- Gemini: both routes fall back to the manual panel / the engine's template sentence on any error or invalid reply.
- Mission room: without the Worker (local dev) the app works alone; the room button reports an error.
- Five Artemis III regions are not in the site list for lack of a published coordinate (D17). Points beyond 2.5 km from a site centre get level 3D ground (the ring and all numbers are exact).

### 4. Open issues, by demo impact

1. Two timed rehearsals and the backup video (P5 exit): `docs/DEMO_SCRIPT.md` is ready.
2. Frame rate on a non-Apple laptop; if low, the playback test prints it and the spec's low-quality toggle would be the next step.
3. Outsider tour test (P4 exit) and the three-outsider question (SM5).
4. Quickmap lit/dark comparison by hand for the judges' Q&A (PGDA scripted check is done).
5. Prize submission steps on the event page (vote snippet question for Cloudflare).
6. `.env` has a space after one `=`, which breaks `source .env` (scripts are unaffected).
7. Visual: the 3D regolith still reads as ripples; a real albedo/normal set and a larger patch are the next step.

### 5. Commands

- Run: `make setup && make dev`
- Test everything: `make check` · validation numbers: `make validate` · performance: `make perf`
- Rebuild data from raw: `make data-download && make data`
- Deploy: `make deploy`, then `make e2e-live`

## 2026-11-14 23:40 EST — P6: real stars and 5 m terrain

**Changed**
- Raw data: eight PGDA 78 5 m site DEMs (527.7 MB) and BSC5 (Harvard TDC copy; CDS was unreachable) downloaded, hashed in DATA.md, uploaded to R2 under `raw/` (sizes verified); `make data-download` fetches them.
- Pipeline: `ephem.year_orientation` (hourly ICRF → MOON_ME quaternions, new `orientation/{year}.bin`), `stars.py` (BSC5 reader, 9,096 stars → `stars.bin`), 5 m heightmaps (1024 px) for eight sites, 20 m kept for IM-2 Mons Mouton; masks, slopes and points unchanged byte for byte.
- App: real star field rotated per site and hour (`skyMatrix`, `starfield.ts`); bare ground on 5 m patches, procedural soil only on the 20 m site and level ground; observer-centred warped terrain mesh (384² quads); new display exposure (D40); footer lists exactly what is illustrative.
- Tests: quaternion round trip, BSC5 parser (Sirius), contract checks for orientation and stars, `orientation.test.ts` (TS rotation vs Skyfield's ICRF Sun, < 1e-4°), star colour test.

**Found and fixed**: a missing factor of 2 in the matrix→quaternion conversion (caught by the round-trip test); a false 0.005° error in the first orientation test from `acos` near 1 (D41); the million-vertex mesh timing out software-rendered tests (D40).

**Test status**: `make check` passes (pytest 24, vitest 49, Playwright 12 + room 1); `make validate` exit 0 with VALIDATION.md unchanged; `make perf`: 60 fps (M5), finder 0.9 s, demo-region load 9.2 MB of 10 (D42).

**Visual finding**: LOLA's 5 m surface is interpolated between tracks, so most landing points look like smooth slopes from 2 m; small craters appear where they exist. Shadows are physical, so some sites are mostly dark at some hours.

## 2026-11-15 — Soil texture back on 5 m sites (D43)

Team feedback: the 5 m ground looked smooth and unrealistic. Cause: the 5 m DEM has no detail below ~5 m, and D39 had removed the procedural texture there. The texture (all features ≤ 1.5 m, below the data's resolution) is back on every patch; footer, README, CLAUDE.md and DECISIONS say so. Checked on the GPU at the Shackleton rim (screenshot viewed). Tests and deploy below.

## 2026-11-15 — Apollo sites removed; lit mountain ring

- Apollo 11/15/17 removed from the app (team decision, D44); still in `make validate`.
- Distant ranges: per-azimuth crest normals from the DEM (`crest_normals`, unit-tested on a synthetic ridge and a flat sphere, and asserted against each site's mask in `make data`) light the horizon ring from the real Sun (D45); illustrative rock texture on it. Checked on the GPU at Shackleton rim (lit), Shackleton in shadow, Connecting Ridge, Nobile Rim 1; screenshots viewed.
