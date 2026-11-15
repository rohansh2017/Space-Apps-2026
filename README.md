# 🌒 Tranquility Base

**A lunar south-pole landing site navigator** · NASA Space Apps 2026 · *Lunar Landing Site Navigator* challenge

**▶ Live: [tranquility-base.rohansh2017.workers.dev](https://tranquility-base.rohansh2017.workers.dev)**

Pick a site and a landing time, stand on the real LRO LOLA terrain in 3D, and see the Sun and Earth exactly where they
will be against the true horizon. Set mission constraints in fields or in a sentence. When the launch slips, a finder
ranks the nearby points and later dates that still work, and says why the others don't.

![Shackleton rim, 19 Nov 2026: the Sun 2° above the ridge, HUD counting down to sunset](web/tests/screenshots/1-plan-shackleton-rim.png)

---

## Why

At the lunar south pole the Sun stays within about 1.5° of the horizon, so **terrain decides whether a site is lit**.
A move of a few hundred metres, or a slip of a few days, can swing a site from sunny to dark, and Earth (the radio link)
drifts in and out of view. The data to check this exists (Horizons, Quickmap, Moon Trek), but checking one site and
date means hopping between specialist tools, and a slipped launch means checking many.

Tranquility Base puts the check in one place and answers the question a planner actually has: **"what now?"**

## Features

| | |
| --- | --- |
| 🌕 **Moon view** | The whole Moon in LOLA relief under the real stars for the hour. Every site is a pin, solid when it meets your constraints and hollow when it fails. Fly down to a site's 10 km search grid, sharp to 20 m out to 32 km and 5 m at the centre. |
| 🏔️ **Stand on the surface** | First-person 3D on real terrain, with the Sun and Earth at their ephemeris positions against the computed 300 km horizon. Play a lunar day and watch the Sun skim the ridgeline. |
| 🔎 **Slip finder** | Ranks every grid point near the plan, and every later landing date in the slip range, against your constraints. 5,000 candidates × 60 days in under a second. |
| ❓ **"Why not?"** | For a failing plan or result: the value each failed constraint would need, and the earliest later landing at the same point that passes everything. |
| 📌 **Compare tray** | Pin up to four scenarios side by side, each frozen at its point and date. Every column is measured against a baseline you choose. |
| ✨ **Gemini** | Type requirements, a slip, where and when in plain words (*Ask Gemini*), and have results reworded. Gemini only reads and words things, and every number is checked against the engine's. |
| 👥 **Mission room** | Share a room link and everyone's view stays in step: site, point, date and constraints. |
| 🧭 **Quick tour** | A 30-second interactive walkthrough on the first visit. It rings each real control and moves on when you use it. |

## Quick start

You need [uv](https://docs.astral.sh/uv/) and Node 22+. The app's data files are committed, so you do **not** need the
7.3 GB of raw downloads to run or test it.

```sh
make setup && make dev        # → http://localhost:5173
```

The Gemini buttons and the mission room run in a Cloudflare Worker, which `make dev` (Vite alone) doesn't start. To use
them locally, run this in a second terminal:

```sh
make dev-api                  # → the Worker on http://localhost:8788; Vite forwards /api and /room to it
```

It reads `GEMINI_API_KEY` from `.env` and rebuilds the app first. Every Gemini press spends real tokens. Without the
Worker those buttons say how to start it, and everything else still works.

> **Full pipeline**, from raw data to a tested app: `make setup && make data-download && make data && make check`

## Using the app

A **quick tour** opens on your first visit. *Quick tour* in the top bar replays it, and `?tour=1` opens it directly
(handy for a demo). The core loop:

1. **Pick a plan.** Choose a site and landing date (UTC) in the *Plan* panel, or click a pin on the Moon.
2. **Look around.** Click a pin to fly to its 10 km search grid, then *Stand here* to stand on that point in 3D.
   Drag the lunar-day scrubber or press *Play*.
3. **Set constraints.** Edit the fields, pick a preset, or type a sentence and press *Ask Gemini*
   (e.g. *"survive 4 days of dark, talk to Earth half the time"*).
4. **Slip the date** and press *Find alternatives*. Each result says how it differs from the plan; a failing one
   says *why not*.
5. **Compare.** Pin results to the tray, choose a baseline with *Compare to this*, and *Copy link* to share the exact view.

Or describe the whole slip in one go: *Ask Gemini* with *"my mission slipped by 11 days, stay near the rim"* or
*"slipped two weeks, anywhere on Nobile, soonest"*. The card shows how each part was read: the new landing (always
measured from the original plan), where to search (this site, named sites, or every site) and when (earliest first, land
by a date). You confirm, and the finder runs. The search settings stay as removable chips under *Find alternatives*.

<details>
<summary><b>All controls</b></summary>

| Where | Control | What it does |
| --- | --- | --- |
| Moon | Drag · wheel | Orbit · zoom |
| Moon | Pin · 👁 beside a pin | Fly to the site's search grid · stand there in 3D at once |
| Moon | *Verdict / Sunlight / Earth* | Colour pins (at the pole) and 500 m cells (at a site) by pass/fail, sunlit % or Earth % |
| Moon | *Topo* | Colour the terrain by height with contour lines (1 km at the pole, 100 m at a site, 20 m on its 5 km patch); the legend gives the LOLA height under the pointer |
| Moon | *Height* slider | Raise the 3D terrain ×1 to ×5 for the eye (numbers always use the true height) |
| Moon | Landing marker · dots · arrow keys | Move the landing point; *Stand here* (or Enter) stands on it |
| Moon / 3D | *Pole* · *Pin* | Back to the pole · pin the view to the Compare tray |
| 3D | Drag | Look around |
| Bottom panel | Scrubber · *Play* | Move through the lunar day |
| Bottom panel | Tab on the top edge · drag the edge | Open/close · resize (arrow keys work; double-click resets) |
| Compare tray | Pin · grip · Alt+arrow | Up to four columns (a fifth asks which to replace) · reorder |
| Compare tray | *Compare to this* · *Make this the plan* | Choose the baseline · swap a column with the plan |
| Results | Minimize | Fold the list into its corner; the chip reopens it |
| Left rail | *Plan* · *Moon* · *Scenario matrix* | Plan panel · Moon view · every site against a range of dates |
| Top bar | *Copy link* · *Mission room* · *Full screen* | Shareable URL · shared room · cinematic mode for a projector |
| Top bar | *Planner / Explorer* | Explorer mode adds plain-language wording and a science tour (*Start tour*) |
| Footer | *About the data* | Every source, and everything the views invent |

Your plan's site, point, date and pinned scenarios are kept in this browser, so a refresh brings them back; a shared
link with its own site wins.

</details>

## How it works

| Layer | What it does |
| --- | --- |
| **Offline pipeline** (Python, `build/`) | Skyfield turns JPL DE440 and the NAIF lunar kernels into hourly Sun and Earth vectors for 2026–2035 in the LOLA frame. numba ray-marches a 360° horizon mask per grid point through the 20 m and 80 m LOLA DEMs out to 300 km. rasterio cuts heightmaps, slopes and hillshades. `make data` writes it all as small contract files. |
| **Engine** (TypeScript, `web/src/engine/`) | Pure functions rotate the vectors into each site's local frame, apply Earth parallax, intersect the 0.53° solar disk with the mask, and compute every metric. A Python reference engine must agree on shared fixtures (`make parity`). |
| **Finder** (Web Worker) | One visibility series per candidate point, then prefix sums and run segments score every start date in O(1). |
| **UI** (React + three.js) | Moon view, 3D ground view, HUD, panorama, constraints, results, Compare tray, scenario matrix, modes and tours. Every number on screen comes from the engine, never from the renderer. |
| **Cloudflare** | Workers static assets serve the app; R2 serves the data files; a Durable Object keeps a mission room in step; Worker routes call Gemini (`gemini-3.5-flash-lite`, about 2 s per answer). |

More detail: [CLAUDE.md](CLAUDE.md) (invariants, data contracts, commands) ·
[docs/spec/SPEC.md](docs/spec/SPEC.md) (the spec) · [docs/DECISIONS.md](docs/DECISIONS.md) (every choice the spec left open).

## Validation

Measured by `make validate` and `make perf`. Full tables: [docs/VALIDATION.md](docs/VALIDATION.md) ·
[docs/PERF.md](docs/PERF.md).

| Check | Result | Target |
| --- | --- | --- |
| Sun and Earth azimuth/elevation vs JPL Horizons (six sites, 720 hourly steps) | max error **0.0007°** | < 0.1° |
| Sunlit % vs PGDA average-illumination maps (nine sites × 441 points) | Pearson r **0.95–0.99**, means within 2 points | pattern agreement |
| Slopes vs the LOLA slope map (nine sites) | r **0.994–0.999**, mean abs diff ≤ 0.33° | agreement |
| Python vs TypeScript engine on shared fixtures | angles within 1e-4°, metrics identical | parity |
| Finder: 5,000 candidates × 60-day range | **0.86 s** | < 3 s |
| 3D frame rate during playback | **60 fps** (Apple M1 Pro, M5) | ≥ 30 fps |
| Load for the demo: app + start data + one region | **9.3 MB** (1.4 + 5.5 + 2.5) | < 10 MB |

## Data sources and credits

- **Ephemeris:** JPL DE440 (`de440s.bsp`) and NAIF lunar orientation and frame kernels, NASA/JPL. Computed offline; the app never calls an ephemeris service.
- **Terrain:** LRO LOLA south-polar DEMs at 20 m and 80 m, LOLA 5 m site DEMs (PGDA product 78, Barker et al. 2021), the LOLA slope map and the global LOLA DEM, NASA GSFC Planetary Geodynamics Data Archive (PGDA). The same data is behind Quickmap and Moon Trek.
- **Validation:** JPL Horizons (topocentric angles); PGDA average solar illumination maps (Mazarico et al. 2011); the LOLA slope map.
- **Site coordinates:** NASA Artemis III (October 2024) and CLPS releases; PGDA product 78 site footprints. Each site records its source and whether it is approximate.
- **Stars:** Yale Bright Star Catalogue, 5th revised edition (Hoffleit & Warren 1991), via Harvard's Telescope Data Center copy of VizieR V/50.
- **Explorer text:** written by the team in our own words from NASA mission pages and Canadian Space Agency (CSA) Moon Exploration material.

File names, sizes and SHA-256 hashes: [docs/DATA.md](docs/DATA.md).

## Limits and honesty

**Screening grade, not mission design.** The search grid is 500 m, terrain is 20 m within 10 km of a point and 80 m
beyond, and azimuth bins are 1°. So small boulders and craters are missed, and custom coordinates snap to the nearest
grid point (the app shows the distance). Horizon rays stop at the edge of the 80 m DEM (±304 km of the pole).

**Not:** a trajectory, fuel or launch-window tool · a landing hazard assessment (slope screening is an aid) · a power or
thermal simulation (the power index is relative) · a communications link budget (geometric Earth visibility only) ·
global (terrain covers 80–90°S). Apollo 11, 15 and 17 are used only by `make validate`, to check angles against Horizons.

**Data vs decoration.** Terrain relief, star positions and brightness, and the Sun's and Earth's positions are data; so
is the distant ranges' outline (the computed horizon) and their lighting (the real LOLA slope at each crest). Invented
for legibility, and labelled in the app's *About the data*:
- the ranges' rock texture and soil texture below the data's resolution (under about 1.5 m);
- the ground colour, the Sun's glare, Earth's surface and star colours (from each star's B−V index);
- a faint fill when the Sun is hidden (real lunar shadow is black);
- in the Moon view, the height exaggeration (×1 to ×5), one uniform ground brightness seen through an exposure curve,
  and ground out of the Sun drawn dimly with a fixed light (the terrain, its real-Sun lighting and shadows are data).

None of it feeds any number. **No synthetic data** is in the deployed app. `make data-fixtures` can generate
contract-shaped files for development; the app then shows a banner, and such files are never committed.

## Develop

### Test

| Command | What it checks | Time |
| --- | --- | --- |
| `make test` | Python and TypeScript unit tests | ~5 s |
| `make parity` | The Python and TypeScript engines give the same answers | ~3 s |
| `make e2e` | Headless Chromium clicks through the demo path and every feature; screenshots go to `web/tests/screenshots/` | ~2.5 min |
| `make e2e-room` | Three browsers in one mission room on a local Worker stay in step | ~25 s |
| `make check-changed` | Only what the changes since `main` can affect (`PLAN=1` prints the plan). **Before every push.** | 0 s – 3 min |
| `make check` | Lint, typecheck and all of the above. **Before merging to `main` and before a deploy.** | ~4 min |
| `make e2e-live` | Every browser test, mission room and Gemini included, against the deployed site | ~4 min |
| `make validate` | Engine vs Horizons, sunlit % vs PGDA, slopes vs LOLA; rewrites `docs/VALIDATION.md` (the last two need the raw data) | ~40 s |
| `make perf` | Finder timing, 3D frame rate on this machine's GPU, download sizes; rewrites `docs/PERF.md` | ~40 s |

After a UI change, look at the screenshots in `web/tests/screenshots/`. The Gemini routes are mocked in `make e2e`, so it
spends no tokens; only `make e2e-live` calls Gemini (about four small calls).

### Rebuild the data

Only needed when the pipeline or the site list changes:

```sh
make data-download   # ~7.3 GB into data/raw/ (resumable, idempotent)
make data            # ephemeris, orientation, stars, masks, slopes, heightmaps, basemaps, relief → web/public/data/ (~20 s)
make validate && make check
```

### Deploy

```sh
make deploy          # builds, uploads the data files to R2, publishes the Worker
make e2e-live        # then check the live site
```

Auth: `npx wrangler login` once, or `CLOUDFLARE_ACCOUNT_API_TOKEN` in `.env`. The Gemini key is a Worker secret
(`npx wrangler secret put GEMINI_API_KEY`); the model is set in `web/wrangler.jsonc`. Secrets live in `.env`, which is
gitignored. Never commit it.

## Repo map

| Path | Contents |
| --- | --- |
| `build/` | Python pipeline, reference engine (`horizonwalk`) and validation scripts |
| `web/` | The app, the Cloudflare Worker and the browser tests |
| `web/public/data/` | Generated data files (the contract; real output of `make data`) |
| `shared/fixtures/` | Engine parity fixtures shared by Python and TypeScript |
| `docs/` | The documents below |

| Document | What's in it |
| --- | --- |
| [spec/SPEC.md](docs/spec/SPEC.md) | The challenge spec, converted from `Space Apps Doc.pdf` |
| [PLAN.md](docs/PLAN.md) | Phases and their checklists |
| [PROGRESS.md](docs/PROGRESS.md) | Dated log of what was done |
| [DECISIONS.md](docs/DECISIONS.md) | Every choice and deviation, numbered D1–D65 |
| [TRACEABILITY.md](docs/TRACEABILITY.md) | Each requirement → where it is built → how it is tested |
| [DATA.md](docs/DATA.md) | Every data file, its source, size and hash |
| [VALIDATION.md](docs/VALIDATION.md) · [PERF.md](docs/PERF.md) | Measured results (generated) |
| [ONE_PAGER.md](docs/ONE_PAGER.md) · [DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md) · [PRIZE_SLIDES.md](docs/PRIZE_SLIDES.md) | Submission material |
