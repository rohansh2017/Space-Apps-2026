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
