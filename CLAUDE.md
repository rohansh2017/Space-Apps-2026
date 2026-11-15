# Tranquility Base

NASA Space Apps 2026 entry (Lunar Landing Site Navigator). A static web app: pick a lunar south-pole
site and date, stand on real LOLA terrain in 3D, see the Sun and Earth against the true horizon, and
let a constraint finder rank alternative sites and dates when a launch slips. Python precomputes
everything offline; the browser does all live work.

**Resume protocol:** read this file → `docs/PROGRESS.md` (last 3 entries) → `docs/PLAN.md` →
`docs/TRACEABILITY.md`, then continue from the first unchecked item.

Source of truth: `Space Apps Doc.pdf` (never edit), converted to `docs/spec/SPEC.md`. How we work:
`SUPER_PROMPT.md`.

## Repo map

- `build/` Python pipeline and reference engine (`horizonwalk`), see `build/CLAUDE.md`
- `web/` React + TS + Vite app, Cloudflare config, see `web/CLAUDE.md`
- `web/public/data/` generated contract files (real output of `make data`)
- `shared/fixtures/` small JSON fixtures used by both engines
- `data/raw/` downloaded DEMs and kernels (gitignored)
- `docs/` PLAN, PROGRESS, DECISIONS, DATA, VALIDATION, PERF, TRACEABILITY, spec/SPEC.md; submission material in ONE_PAGER, DEMO_SCRIPT, PRIZE_SLIDES

## Commands

`make setup` · `make data-download` · `make data` (real) · `make data-fixtures` (synthetic) ·
`make test` · `make parity` · `make validate` (Horizons + PGDA illumination + LOLA slopes) · `make e2e` ·
`make e2e-room` (mission room on a local Worker) · `make perf` ·
`make check` (lint + typecheck + test + parity + e2e + e2e-room) · `make check-changed` (only what the changes since `main` can affect; `PLAN=1` prints the plan) · `make dev` · `make build` ·
`make deploy` (uploads `web/public/data` to R2, then publishes) · `make e2e-live` (all browser tests, room and Gemini included, against the live site).

Secrets live in `.env` (gitignored): Cloudflare R2 S3 keys and `GEMINI_API_KEY`. The Worker has
`GEMINI_API_KEY` as a secret and the R2 bucket `tranquility-base-data` bound as `DATA`.

How to launch and test: `README.md`, "Launch and test". Run `make check-changed` before every push, and the full `make check` before merging to `main` and before `make deploy`.

Live URL: https://tranquility-base.rohansh2017.workers.dev (Workers static assets; `/data/*` from R2 with the bundled copy as fallback).

## Scientific invariants (each gets a unit test)

1. One frame everywhere: MOON_ME_DE440_ME421 (matches the LOLA DE421 mean-Earth DEMs).
2. Ephemeris offline with Skyfield: hourly Sun/Earth unit vectors + Earth distance, 2026–2035, Float32 per year.
3. Per-site angles by rotating into the site's east/north/up frame; Earth gets the parallax correction (~0.26°).
4. DEM: south polar stereographic, true at the pole, R = 1,737,400 m, pixel-registered; round trip < 1 cm.
5. Horizon mask: 360 × 1° bins from 2 m, ray-march to ~300 km (20 m DEM inside 10 km, 80 m beyond,
   step ≈ 0.5% of d), minus curvature d²/(2R), no refraction, linear interpolation between bins.
6. Sun is a 0.53° disk (visible fraction 0–1); Earth visible when its centre is ≥ 1° above the mask.
7. Metrics exactly as in the spec's metric table; Python and TS must agree on `shared/fixtures`.
8. Finder: per-constraint pass/fail, ranked by normalized weighted margin, O(1) per start time; start dates run forward only from the planned hour.
9. Custom coordinates snap to the nearest grid point and show the snap distance.

## Data contracts (frozen in P0; writer: `build/scripts/make_fixtures.py`, checks: `build/tests/test_fixtures.py`)

All binaries little-endian. All paths relative to `web/public/data/` (same paths in R2).

- `ephemeris.json`: `frame`, `start_utc`, `step_seconds`, `fields`, `years{year: {file, hours}}`.
  `ephemeris/{year}.bin`: Float32 × 7 per hour: sun xyz (unit), earth xyz (unit), earth distance km.
- `points.json`: `mask{dtype, bins, unit_deg, offset_deg}`, `grid{n, step_m, centre_index}`,
  `points[]{id, region, parent_site, index, lat, lon, x, y, elev_m}`.
  `masks/{region}.bin`: Uint16 × 360 per point, row = `index`; elevation° = value × 0.01 − 10; bin k = azimuth k°.
  A region is one curated site's 21 × 21 grid (500 m), row-major from (−5 km, −5 km) in stereographic x/y; the site is index 220.
- `slopes/{region}.bin`: Uint8 degrees per point, same order.
- `ridges/{region}.bin`: Int8 × 3 per azimuth bin (360): unit normal × 127 of the horizon-forming crest seen from the region's site centre, in that site's east/north/up axes (curvature included). Lights the 3D horizon ring.
- `sites.json`: `sites[]{id, name, lat, lon, coord_source, approximate, terrain, mission, agency, blurb, links, heightmap}`;
  `heightmap` is null for no-terrain sites, else `{file, offset_m, scale_m, size_px, span_m}`.
- `heightmaps/{site}.png`: 16-bit greyscale over 5 × 5 km in local east/north axes, row 0 = north, col 0 = west; height m = offset_m + value × scale_m.
  1024 × 1024 from a PGDA 78 5 m site DEM where one covers the patch, else 256 × 256 from the 20 m DEM; `sites.json` heightmap has `size_px`, `res_m`, `source`.
- `ephemeris.json` `orientation`: `{from: "ICRF", to: frame, fields: [qw, qx, qy, qz], years{year: {file, hours}}}`; `orientation/{year}.bin`: Float32 × 4 per hour, the unit quaternion of the ICRF → frame rotation (same hours as the ephemeris).
- `stars.json`: `{source, file, count, frame: "ICRF (J2000)", fields}`; `stars.bin`: Float32 × 5 per star: ICRF unit vector x, y, z, V magnitude, B−V (NaN if unknown).
- `tour.json`: `credit`, `steps[]{id, title, body}`, `glossary[]{term, definition}` (source: `build/tour_src.json`).
- `basemap.json`: `pole{file, half_width_m}`, `regions{half_width_m, files{region: file}}`.
  `basemaps/*.png`: 8-bit greyscale hillshade, square, stereographic x/y axes (row 0 = +y, col 0 = −x), centred on the pole or the region's site.
- `constraints.schema.json` (hand-authored): `constraints[]{id, type, unit, min, max, default}`.
- Room message: `{type: "state", site_id, point_index (grid index or null), utc, constraints{id: value}, sender}` (`shared/fixtures/room_message.json`);
  the room also sends `{type: "presence", count}`. Route `/room/{id}` (WebSocket) → Durable Object `MissionRoom` (`web/worker/room.js`).
- Any file made from synthetic data carries `"synthetic": true` in its JSON.

## Conventions

- Smallest change that meets the spec. No speculative features or abstraction layers.
- Never present synthetic data as real; `docs/VALIDATION.md` holds only command output.
- 3D decoration that is not data (procedural soil texture below 1.5 m on every patch, the horizon ring's rock texture (its lighting is data), the ground colour, Sun glare, Earth's surface, star colours from B−V) must stay labelled and must stay below the DEM's resolution; no number may come from the renderer. Star positions and LOLA relief are data.
- Branch `build/tranquility-base`; conventional commits; never commit `data/raw/` or files > 50 MB.
- Push every commit straight to its working branch once `make check-changed` passes (team decisions 2026-11-15; overrides the brief's "do not push"). Run the full `make check` before a branch is merged to `main` and before `make deploy`. Never force-push; `main` changes only through pull requests the team merges. After a push that changes the app, `make deploy` then `make e2e-live`.
- After every change, update the docs it affects in the same commit: PLAN (tick), PROGRESS (append), DECISIONS (any choice or deviation), TRACEABILITY, DATA (new or derived files), README/footer (anything user-visible).
