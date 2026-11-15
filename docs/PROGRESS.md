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

## 2026-11-15 — Docs audit; push rule

Audit of every doc against the repo. Fixed: CLAUDE.md commands (e2e-room, e2e-live; check includes the room test) and doc map; web/CLAUDE.md (Gemini routes, `/api/*`, star field, ridge lighting); DATA.md derived files (ridges, nine sites); perf.sh per-region size now counts ridges, PERF.md regenerated; PLAN P6 lists the ring lighting and the Apollo removal. New standing rules in CLAUDE.md: push every commit to `build/tranquility-base` after `make check` (team decision), and update affected docs in the same commit.

## 2026-11-15 — Callout borders

The snap-note and Gemini-proposal callouts lose their yellow left bar (a design-review finding) for a 1 px full border, so the accent colour is freed for sunlight. Screenshot 14 viewed. Replacing Inter waits for the redesign decision (the face must be bundled: no runtime font requests).

## 2026-11-15 — PRODUCT.md: comparison-first

`/impeccable init` updated PRODUCT.md with the challenge objective as the primary purpose: rapid comparison of multiple landing scenarios when constraints shift. Confirmed with the user: planning teams are the primary users and the judges' demo is the proof; full screen means the interface fills the window and a Fullscreen-API toggle exists; how many scenarios can be compared at once is left open for `/impeccable shape`. Kept: truth-first data, labelled decoration, no numbers from the renderer, screening-grade statement on screen, no runtime network calls.

## 2026-11-15 — `/impeccable harden` (branch `redesign/new-visual-identity`)

- Results: each "Open in 3D" / "Back to plan" button has its own accessible name (`Open in 3D: #1, 5.0 km S, 16 days later, Shackleton rim, …`; visible text unchanged); search start/finish announced; focus moves to the "Alternatives" heading when a search finishes.
- Constraint edits mark results out of date with "Run again" instead of deleting them; out-of-range input shows an inline error and keeps the last valid value (D46).
- Tour takes focus, closes on Escape, returns focus to "Start tour"; Next turns into Finish in place so focus is not lost.
- Glossary definitions linked with `aria-describedby` (the visual tooltip is CSS content, which screen readers skip).
- Finder and terrain-load failures are inline with retry; failed region loads are no longer cached.
- Scrubber and Play: already keyboard-operable (probe); scrubber now has `aria-valuetext`.
- Tests: new `a11y.spec.ts` (5 tests) and screenshots 16–17 (viewed); demo test updated for the out-of-date behaviour and marked slow. `make check` passes.
- Not deployed: this branch is the redesign branch, so the live site still runs `build/tranquility-base`.

## 2026-11-15 — `/impeccable clarify` (branch `redesign/new-visual-identity`)

Result titles by difference, site and time below, metrics change once; comparison labels by distance and date; thresholds on every chip (with the search's own values); HUD horizon height toward the Sun and Earth; Shackleton blurb reworded and `make data` rerun (only `sites.json` changed) (D47). Contrast fix: HUD sub-rows use `--dim`, since `--mute` is about 4.3:1 there. Tests: new `diffParts` unit test; demo and F11 tests updated to the new wording. Screenshots 1, 2 and 10 viewed. `make check` passes. Not deployed (redesign branch).

## 2026-11-15 — `/impeccable delight` (branch `redesign/new-visual-identity`)

Shadow display fill (D48): the slipped-date demo frame now shows the dimmed ground and distant ranges instead of black, with an in-view tag and a footer line naming it a display aid. Checked on the GPU at the slipped date and at the sunset frame, and in screenshot 3; demo test asserts the tag is absent in sunlight and present in shadow. `make check` passes. Not deployed (redesign branch).

## 2026-11-15 — `/impeccable layout` (branch `redesign/new-visual-identity`)

Full-screen comparison-first redesign (D49): window-filling 3D view, left rail and Plan panel with *Find alternatives* always visible, bottom band with panorama and the Compare tray (plan + 3 pins, pins in the share link), Map / Scenario matrix / Mission room drawers, one-line footer with *About the data*, full-screen toggle, polar-light palette and Public Sans. New components `Tray`, `Drawer`; `Compare.tsx` removed. Tests: F11 rewritten for the tray (pin, unpin, link, focus), map/matrix/room tests open their drawers, panorama and illumination colour checks updated; `share.ts` pins round-trip unit test. Screenshots checked at 1440×900, 1280×720 and 390 px; impeccable detector clean. Finish review (disposition: fix) acted on: with results open the HUD shrinks to its two countdowns above the results so the sky stays clear; pinned tray columns show engine deltas against the plan; tray metrics one per line; panorama labels sized for their on-screen width; shorter band on windows under 800 px tall; the level-ground fallback added to *About the data*; matrix drawer sized to its content. DESIGN.md and `.impeccable/design.json` written from the build. `make check` passes. Not deployed (redesign branch).

## 2026-11-15 — `/impeccable polish` (branch `redesign/new-visual-identity`)

Worked from all 17 test screenshots. Fixed: tray columns and result rows no longer cut or split landing dates (dates kept on one line; tray detail split into site and time); result rows put title and actions on one line with the site and date full width below; the tour stacks under the status card instead of covering its chips; the Map drawer shows both maps side by side, so the illumination map and its legend are visible without scrolling; panorama elevation labels are outlined so they read over the terrain; the Plan panel fades at its foot to show it scrolls. No behaviour or copy changes. Detector clean; `make check` passes. Not deployed (redesign branch).

## 2026-11-15 — `/impeccable critique` and its P1 fixes (branch `redesign/new-visual-identity`)

Dual-agent critique against the comparison objective: 25/40, detector clean in source (in-page: placeholder contrast 3.6:1, 11.8 px small text), snapshot in `.impeccable/critique/`. Fixed the three P1s (D50): compare mode for the band so the tray fits a 720p full screen (band 437/437 px, no scroll; 1440×900 392/392 with a 420 px view), the tray as a table with shared rows and the best value per row in bold, and *Make this the plan*. F11 test extended (best marker, adopt, focus). P2s left open: pinning feedback, sticky results header, matrix pass/fail mode. `make check` passes. Not deployed (redesign branch).

## 2026-11-15 — Collapsible panels, resizable band, cinematic full screen (branch `redesign/new-visual-identity`)

Team request (D51): HUD, plan/alternative card and bottom band collapse; the band resizes by drag or keyboard; full screen folds the panels away, fades the chrome when idle, adds a letterbox, and restores the layout on exit. Checked in Chromium at 1440×900 (drag, collapse, full screen idle and awake, exit). New e2e test covers collapse, keyboard resize and the full-screen round trip. `make check` passes. Not deployed (redesign branch).

## 2026-11-15 — Band tab and interface motion (branch `redesign/new-visual-identity`)

Team request (D52): one open/close tab on the band's top edge in the same place open or closed; panel toggles morph via View Transitions; drawers, results, tray columns, prompts and the tour ease in; press feedback on buttons; pin icon pops. Checked in Chromium (tab position identical open and closed, mid-transition frame). `make check` passes. Not deployed (redesign branch).

## 2026-11-15 — Panel transitions, exclusive left panels, minimizable alternatives, benchmark (branch `redesign/new-visual-identity`)

Team request (D53). Fixed the Plan-panel close glitch (blurred box; stretching; double tags), found by filming transitions at 1/20 speed. Plan / Map / Scenario matrix are exclusive and close the same way; the alternatives minimize into their top-right corner and back. New e2e test (exclusive panels, minimize and restore with focus). Benchmark (`make perf`, docs/PERF.md, mains power): finder 856 ms for 5,000 candidates; 3D playback 60 fps, equal to the empty-page cap (same as P6). On battery at 4% both the app and an empty page were capped at 30 fps, and an earlier finder run read 2,614 ms under load; no long animation frames during playback with the band open or collapsed. The snap note is now also shown in the Map drawer (invariant 9), since the map closes the Plan panel; app bundle 1.38 MB after switching to the Latin font subset (was 1.49 MB with all subsets, 1.23 MB before the redesign's font and icons); data sizes unchanged. `make check` passes. Not deployed (redesign branch).

## 2026-11-15 — Quiet first view and stored locations (branch `feat/quiet-first-view`)

Team request (D54): default view is the Plan panel with the card, HUD and band folded; plan site, point, date and pins kept in `localStorage` and restored from the bare address. New unit and e2e tests; e2e suite unfolds panels via `expandPanels`; local test limit 60 s. `make check` passes. Not deployed (needs a PR to `main`).

## 2026-11-15 — `make check-changed` (branch `feat/quiet-first-view`)

Team request (D55): per-push checks limited to what the changed files can affect; full `make check` kept for merges to `main` and deploys. Verified: docs-only change → nothing runs; this branch → lint, typecheck, 1 unit-test file, all browser tests, room test (passed, 3 min 8 s). CLAUDE.md, README updated.

## 2026-11-15 — Baseline of your choice, optional plan column, clearer map marks (branch `feat/quiet-first-view`)

Team request (D56). Tray starts empty, the plan is an optional column, *Compare to this* sets the baseline; carried in the link and stored locations. Tray hint removed. Map markers enlarged with dark halos. New e2e test (empty start, add/remove plan, change baseline, unpin baseline); the shared `expandPanels` helper adds the plan and opens the compare-mode disclosure so earlier tests keep their meaning; fixed the disclosure folding on a site change. Checked in Chromium at 1440×900 (empty tray, three columns with the plan or a pin as baseline, map drawer).

## 2026-11-15 — Deployed PR #9; tray labels, one pin button, timeline kept visible (branch `feat/tray-labels-pin-view`)

PR #9 (quiet first view, stored locations, check-changed, baseline choice) merged, full `make check` passed, deployed (version 42a14934); `make e2e-live` 23 of 24 passed, F21 failed because Gemini answered 429 (quota), reproduced and confirmed by driving the live page. Then (D57): row labels always visible, *Add the plan* removed in favour of *Pin this view*, nudge/skyline/horizon text no longer folded in compare mode, Baseline label contrast fixed, F21 skips only on a 429. All local browser tests pass.

## 2026-11-15 — Deployed PR #10 (branch `test/gemini-quota-skip`)

PR #10 (D57) merged, full `make check` passed, deployed (version cbc21d87). `make e2e-live`: 23 of 24 passed; F22 failed only because Gemini answered 429 (quota) and the test did not accept the template fallback it is named for. F22 now skips on a 429 only, like F21; re-run live: both Gemini tests skipped on quota, every other live test passed in the deploy run. Test-only change, no redeploy needed.

## 2026-11-15 — Moon view (branch `redesign/new-visual-identity`)

Team request (D58): an orbitable south polar region is now the default stage. Every curated site is a pin coloured by the engine's verdict for the landing hour; a pin flies down to the site's 10 km grid, where the landing point is dragged, clicked or moved with the arrow keys, and *Stand here* / Enter hands off to the ground view. Grid dots show sunlit %, Earth % or pass/fail from one engine pass (F15 now uses it); tray pins (A–D) and finder results (numbered rings) are marked; bearing lines carry the engine's Sun and Earth elevations; the day/night line follows the scrubber. The tray gains *Show on the Moon*. Pins load one mask row per site through HTTP Range (Worker answers 206 from R2), so first load is unchanged. Tests: `moon.test.ts` (axes round trip, stereographic vs points.json, ray pick to grid index incl. centre, corner and outside, verdict equals `evaluate()` on the engine fixture, fly pose), `moon.spec.ts` (pins and verdicts, pole bearings vs engine, fly-down, dot tooltip, drag with snap note and `point` in the link, HUD equals engine after the drag, click, outside the grid, arrow keys, Enter to the ground view, reduced motion, share link with `point` opens on the ground, finder rings, tray letter and *Show on the Moon*, fixed marker for an alternative). The demo and playback tests step onto the ground first. Screenshots viewed on the GPU (Intel Arc, D3D11): pole, scrubbed terminator, Shackleton rim and Nobile Rim 2 region views, top-down alignment against the Map drawer, results and pins at the pole. On this Windows machine without `make`, the steps of `make check` were run one by one; the browser suite passes with 3 workers; with 7 workers one timing-sensitive test fails per run under load (the unchanged code fails 3–4 per run on the same machine, in 3 min instead of 1). The mission-room test was not run locally. Not deployed (redesign branch).

Merged with `main` (D54–D57 from the team): the Moon view stays the default stage under the quiet first view; only a link's own `point` opens the ground view, so a point remembered in `localStorage` keeps the Moon; tray letters run A–D for the four-column tray; tray columns keep *Compare to this* and gain *Show on the Moon*; the Moon tests unfold the panels with `expandPanels`.

## 2026-11-15 — Pins that always work, tray reorder, band tab, the whole Moon textured (branch `redesign/new-visual-identity`)

Team request (D59, D60). Root cause of the pinning bugs: *Pin this view* added one live plan column and then disabled itself. Now every pin is a snapshot, the button toggles to *Unpin this view* and asks which column to replace when the tray is full, *Open in 3D* no longer pins, and old `pins=plan` links still open. Tray columns reorder by drag or Alt+arrows; the band tab is a labelled pill. The Moon view has LOLA relief over the whole globe (new `basemaps/globe.png`, 1.96 MB, after the polar map) and the zoomed site shows its 5 m heightmap. Tests: `share.test.ts` (legacy decode), `moon.test.ts` (globe uv, site uv, site hillshade), `test_fixtures.py` (globe contract), e2e: F11 and the D54/D56 tray tests rewritten for snapshots; new tests for pin-spot-after-spot, full tray, drag and keyboard reorder with the baseline kept, a pre-D59 link, and the globe and heightmap fetches. GPU screenshots viewed: textured pole and whole-hemisphere views, Shackleton rim and Connecting Ridge zoomed (5 m craters visible), the tab. Not deployed.

## 2026-11-15 — Stars on the Moon, Pole everywhere, fewer clicks, Map drawer folded in, 20 m site context (branch `redesign/new-visual-identity`)

Team request (D61, D62). The Moon view shows the BSC5 stars for the hour at the pole and at a site; the star inputs load a year at a time for both views. *Pole* is always one click (Moon bar, and over the 3D view). Click audit: folded card shows the constraint tally; *Pin* on the Moon bar and over the 3D view; *Show on the Moon* on each finder result; an eye beside each site pin stands there in 3D. The Map drawer is gone; its heat map is the Moon view's Sunlight/Earth layer (filled cells at a site, tinted pins at the pole). Downloaded the 20 m polar DEM (2.70 GB) and built 20 m context maps ±32 km around each site (1.37–1.58 MB JPEG each); the 5 m layer now waits until the camera is within about 8 km. First view with one fly-down 9.71 MB. Tests: `moon.test.ts` (`icrfToThree` vs `quatRotate`), `test_fixtures.py` (context contract), e2e: stars at both levels, Pole reset after an orbit, context on fly-down and heightmap only on zoom, F15 as Moon heat cells and tinted pins, a click-count test (tally, Pin, eye button, ground Pole and Pin, result to the Moon); map tests moved to the Moon view. GPU screenshots viewed: pole with stars, Shackleton rim heat map, the site at 20 m context, the 3D view's Pole and Pin. Not deployed.
