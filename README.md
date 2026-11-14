# Tranquility Base

NASA Space Apps 2026 entry for the Lunar Landing Site Navigator challenge. Pick a lunar south-pole
landing site and date, stand on real LOLA terrain in 3D, and see the Sun and Earth against the true
horizon. Work in progress: see [docs/PLAN.md](docs/PLAN.md) for what is built.

Live: https://tranquility-base.rohansh2017.workers.dev

## Launch and test

Everything runs through `make` from the repo root. You need [uv](https://docs.astral.sh/uv/) and Node 22+.

### First time on a machine

```sh
make setup                              # Python env + npm packages
cd web && npx playwright install chromium && cd ..   # browser for the end-to-end test
```

The app's data files are committed in `web/public/data/`, so you do **not** need the multi-GB
downloads just to run or test the app.

### Run the app

```sh
make dev        # http://localhost:5173, reloads on save
```

What to try: choose a site, change the date (UTC), drag the lunar-day scrubber or press Play, drag
inside the 3D view to look around. Slip the date and press Find alternatives. Type a custom
coordinate or click either map. Open a result: the plan and the alternative appear side by side.
Nudge the plan 500 m or a day and watch the tiles change. Switch to Explorer mode and press
Start tour. Open the scenario matrix and click a cell. Press Start mission room, open the link in
a second browser, and change the site or date in either: both follow. On the deployed site, type a
requirement under the constraints ("survive 4 days of dark, talk to Earth half the time") and press
Interpret with Gemini; the proposal appears for you to apply. Locally there is no Worker, so that
button reports an error and the fields still work by hand.

### Test

| Command | What it checks | Time |
| --- | --- | --- |
| `make test` | Python unit tests + TypeScript unit tests | ~5 s |
| `make parity` | Python engine and TypeScript engine give the same answers | ~3 s |
| `make e2e` | Opens the built app in headless Chromium, clicks through it, saves screenshots to `web/tests/screenshots/` | ~15 s |
| `make e2e-room` | Starts the Worker locally (`wrangler dev`) and checks that three browsers in one mission room stay in step | ~25 s |
| `make check` | Lint + typecheck + all of the above. **Run this before every push.** | ~60 s |
| `make validate` | Engine angles vs JPL Horizons, and sunlit % vs the PGDA illumination maps; rewrites [docs/VALIDATION.md](docs/VALIDATION.md). Needs `make data-download` for the PGDA part | ~35 s |
| `make perf` | Finder timing, 3D frame rate on this machine's GPU, download sizes; rewrites [docs/PERF.md](docs/PERF.md) | ~40 s |

After a UI change, open the screenshots in `web/tests/screenshots/` and look at them.

### Rebuild the data (only if the pipeline or site list changes)

```sh
make data-download   # ~6.8 GB into data/raw/ (resumable)
make data            # real ephemeris, masks, slopes, heightmaps -> web/public/data/ (~15 s)
make validate && make check
```

`make data-fixtures` writes synthetic mock data instead; the app then shows a "Synthetic data"
banner. Run `make data` to go back to real data. Do not commit synthetic files.

### Deploy

```sh
make deploy          # builds, uploads the data files to R2, publishes to Cloudflare
```

Auth: `npx wrangler login` once, or `Cloudflare_Token_Value` in `.env`. After a deploy, run
`make e2e-live`: it runs the browser tests (mission room included) against the live site and prints the data source header,
which should say `x-data-source: r2`.

Secrets (R2 keys, `GEMINI_API_KEY`) live in `.env`, which is gitignored. Never commit it.

## Data credits

NASA/JPL DE440 ephemeris and NAIF lunar kernels; LRO LOLA polar DEMs from NASA GSFC PGDA.
Details and hashes: [docs/DATA.md](docs/DATA.md).

## Limits

Screening-grade only: 500 m search grid, 20 m terrain within 10 km and 80 m beyond. Not a mission
design, landing hazard, power, thermal or link-budget tool. In the 3D view, ground detail finer than
the 20 m terrain, the stars, the Sun's glare and Earth's surface are illustrative.
