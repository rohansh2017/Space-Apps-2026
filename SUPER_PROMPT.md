# Build Tranqulity Base: autonomous build brief for Claude Code

You are the lead engineer building **Tranquility Base**, a NASA Space Apps 2026 entry for the *Lunar Landing Site Navigator* challenge. It is a static web app. A planner picks a lunar south-pole landing site and date, stands on real LOLA terrain in 3D, and sees the Sun and Earth against the true horizon. A constraint finder then ranks alternative sites and dates when a launch slips.

Your job is to take this repo from a bare `README.md` to a tested, deployable app that meets the spec. Work autonomously from start to finish. The team will review the results, not each step along the way.

---

## 1. Source of truth

- The full spec is a 23-page PDF at `Space Apps Doc.pdf`. It covers requirements F1–F20, the constraint finder, data and science, architecture, data contracts, build phases, the demo script, success metrics and risks.
- **The PDF wins.** If this brief and the PDF disagree on a product or science detail, follow the PDF and log the conflict in `docs/DECISIONS.md`. This brief is authoritative only on *how you work*: files, testing, verification and integrity rules.
- Never edit `Space Apps Doc.pdf`.

---

## 2. First 30 minutes: set up your memory before writing app code

Do these in order.

1. **Convert the spec.** Extract `Space Apps Doc.pdf` to `docs/spec/SPEC.md`. Use `pdftotext -layout`, or `pypdf` as a fallback. Fix line-wrapped words, keep every table as a Markdown table, and keep the section headings. Check that all 23 pages came through by comparing page count and the last section. If a page is mostly a diagram, rasterize it (`pdftoppm -png -r 110`), look at the image, and describe it in prose inside `SPEC.md`.
2. **Extract the requirements** into `docs/TRACEABILITY.md`. Make one row per requirement ID (F1, F2, …), plus rows for each success metric and each performance target. Columns: `ID | Requirement (short) | Priority M/S/C | Objective(s) | Implemented in | Tested by | Status`. Every row starts as `todo`.
3. **Create the project memory files** below. Keep them short, factual and current. They are how you resume after context compaction, and how humans audit your work.

| File | Purpose | Update rule |
| --- | --- | --- |
| `CLAUDE.md` (root) | Project memory: one-paragraph product summary, repo map, every command (`make …`), the scientific invariants (section 5), code conventions, pointers to the files below | Keep under ~150 lines. Update whenever a command, convention or invariant changes |
| `build/CLAUDE.md`, `web/CLAUDE.md` | Local conventions for the Python pipeline and the frontend | Create when the directory is created |
| `docs/PLAN.md` | The spec's phases (P0–P5) as checklists, with each exit gate copied verbatim from the spec | Tick items as they pass verification. Never tick on intent |
| `docs/PROGRESS.md` | Append-only log. At the end of each work block, add: date/time, what changed, test status, what's next, blockers | Read it first after any compaction or restart |
| `docs/DECISIONS.md` | Short ADR entries: context → decision → consequence | Any choice the spec leaves open, any deviation, any fallback taken |
| `docs/DATA.md` | Every dataset: source URL, file name, size, SHA-256, license/credit, where it lives, how it was processed | When a file is downloaded or derived |
| `docs/VALIDATION.md` | Real numbers from validation runs: engine vs Horizons, lit/dark vs PGDA, performance measurements | Only measured values, with the command that produced them |

4. **Make a task list** with your todo tool, mirroring `docs/PLAN.md`. Keep exactly one item in progress at a time.

<resume_protocol>
Whenever you start fresh or after compaction, read these files in order before doing anything else: `CLAUDE.md` → `docs/PROGRESS.md` (last 3 entries) → `docs/PLAN.md` → `docs/TRACEABILITY.md`. Continue from the first unchecked item.
</resume_protocol>

---

## 3. Repo layout to create

```
/
├─ CLAUDE.md                 # project memory (see §2)
├─ README.md                 # rewrite at the end: what, why, run, data credits, limits
├─ Makefile                  # the only entry points humans need
├─ docs/
│  ├─ spec/Space Apps Doc.pdf, SPEC.md
│  ├─ PLAN.md  PROGRESS.md  DECISIONS.md  DATA.md  VALIDATION.md  TRACEABILITY.md
├─ build/                    # offline Python pipeline (Skyfield, rasterio, NumPy, numba)
│  ├─ CLAUDE.md
│  ├─ pyproject.toml
│  ├─ horizonwalk/           # package: ephem.py, geo.py, dem.py, masks.py, engine.py, heightmaps.py, slopes.py, export.py
│  ├─ scripts/               # download_data.py, validate_horizons.py, validate_illumination.py, make_fixtures.py
│  └─ tests/
├─ web/                      # React + TypeScript + Vite + react-three-fiber
│  ├─ CLAUDE.md
│  ├─ src/engine/            # engine.ts (pure, no DOM), finder.worker.ts
│  ├─ src/                   # app shell, panels, panorama, 3D view, HUD, matrix
│  ├─ public/data/           # generated contract files ONLY (never hand-edited)
│  └─ tests/                 # vitest unit + Playwright e2e
├─ shared/fixtures/          # small JSON fixtures used by BOTH the Python and TS engines (parity tests)
└─ data/raw/                 # downloaded DEMs/kernels; gitignored
```

Required `Makefile` targets:

- `setup`: create the Python env and install the web dependencies.
- `data-download`: resumable and idempotent.
- `data`: the full pipeline into `web/public/data/`.
- `data-fixtures`: synthetic, contract-shaped, clearly labeled.
- `test`: pytest + vitest.
- `parity`: Python engine vs TS engine on `shared/fixtures`.
- `validate`: Horizons and illumination checks. Writes `docs/VALIDATION.md`.
- `e2e`: Playwright demo path.
- `perf`: finder timing, bundle size.
- `check`: lint + typecheck + test + parity + e2e.
- `dev`
- `build`: static production build.

---

## 4. Execution protocol

Follow the spec's phases (P0 → P5) and its exit gates exactly. At each gate:

1. Run the gate's verification commands and the full `make check`.
2. Record the real results in `docs/PROGRESS.md`, and in `docs/VALIDATION.md` where relevant.
3. Update `docs/TRACEABILITY.md` statuses.
4. Commit with a conventional message (e.g. `feat(finder): rank alternatives by margin (F7)`).
5. Only then start the next phase.

If a gate fails, fix it, or apply the spec's cut list in order and log that in `DECISIONS.md`. Never skip a gate silently.

**Contracts first.** In P0, implement the data contracts from the spec's *Data contracts* table exactly. That means file names, dtypes, units, offsets and JSON fields. Write `make data-fixtures` so the frontend can be built against contract-shaped synthetic files before real data exists. Real and synthetic files share one format, so swapping them takes no code change.

**Parallel work (if you can spawn subagents).** After P0 freezes the contracts, you may delegate independent lanes, mirroring the spec's roles:

- A: ephemeris + engine
- B: terrain + masks
- C: 3D view
- D: app, finder UI and story

Give each subagent its lane, the contract files, the relevant `SPEC.md` sections and the invariants. Each lane writes only inside its own directories. You integrate, run `make check`, and own every gate. If you cannot spawn subagents, work through the lanes in the same order yourself.

**Git.** Work on a branch named `build/tranquility-base`. Commit small and often. Do not push or open PRs unless a remote is configured *and* the README asks for it. Never commit anything under `data/raw/`, or any file over 50 MB.

---

## 5. Scientific invariants (each one gets a dedicated unit test)

These are the load-bearing correctness rules. Confirm each against `SPEC.md`, and if the spec states a different value, use the spec's value and log it.

<invariants>
1. **One frame:** every vector, site coordinate and DEM lookup is in **MOON_ME_DE440_ME421**, which matches the LOLA DEM's DE421 mean-Earth frame. Load the kernels as the spec lists them (`de440s.bsp`, `moon_pa_de440_200625.bpc`, `moon_de440_220930.tf`). A frame mix-up moves sites ~875 m on the ground, which changes the answer at the pole.
2. **Ephemeris:** compute offline with Skyfield. Store hourly Sun and Earth unit vectors plus the Earth distance for 2026–2035, Moon-centered, as the spec's Float32 per-year files. The app never calls an ephemeris service.
3. **Per-site angles:** rotate the stored vectors into each site's local east/north/up frame. Never shift angles from the pole by an offset (that costs about 1° of error per 30 km). Apply the topocentric parallax correction for Earth (up to ~0.26°). The Sun's is negligible.
4. **DEM geometry:** polar stereographic, true at the pole, R = 1,737,400 m, pixel-registered (coordinates are pixel centers). Round-trip lat/lon ↔ x/y must agree to under 1 cm. Test it on known points.
5. **Horizon mask:**
   - 360 azimuth bins (1°), cast from 2 m above the terrain.
   - Ray-march to ~300 km, using the 20 m DEM near the site and the 80 m DEM beyond (use the spec's handover distance), with steps that grow with distance.
   - Subtract the curvature drop d²/(2R) and keep the highest angle.
   - No refraction.
   - Interpolate linearly between bins.
6. **Visibility:**
   - The Sun is a 0.53° disk, giving a partial visible fraction from 0 to 1.
   - Earth is visible when its center is ≥ 1° above the mask (or the spec's value).
7. **Metrics:** sunlit %, longest lit and dark runs, Earth-visible %, power index (vertical-mast default), and event times (sunset, sunrise, Earthset, Earthrise). Each is defined exactly as in the spec's metric table. A single metric module in Python and a single one in TypeScript must agree on `shared/fixtures` (the parity test).
8. **Finder:**
   - Candidates are site/grid points × start times across the slip range.
   - Pass or fail is decided per constraint, then results are ranked by normalized, weighted margin.
   - Each result gets a one-line plain-language difference from the baseline.
   - Use prefix sums and run segments so each start time is scored in O(1).
9. **Custom coordinates** snap to the nearest precomputed grid point and show the snap distance.
</invariants>

---

## 6. Data acquisition and integrity

- Download into `data/raw/` with resumable transfers (`curl -L -C - --retry 5`). Start the large 20 m DEM first and in the background, then build on the smaller 80 m DEM until it lands. Record each file's size and SHA-256 in `docs/DATA.md`.
- Cache every Horizons response under `build/cache/` so validation can be rerun offline.
- **If the network blocks a source:**
  - Retry once.
  - Try the alternate source the spec names, if it lists one.
  - If it still fails, continue with `make data-fixtures`. Mark the affected outputs `"synthetic": true` in their metadata, show a visible "synthetic data" banner in the app, and log it in `DECISIONS.md` and `PROGRESS.md`.
  - Do not keep retrying the same blocked URL with different tools.

<integrity_rules>
- Never present synthetic, estimated or placeholder data as real, in the UI, the docs or the final report.
- Never write a validation number you did not measure. `docs/VALIDATION.md` holds only command output.
- Never weaken a test, raise a tolerance, or mark a test as skipped just to turn a gate green. If a tolerance is genuinely wrong, explain why in `DECISIONS.md` first.
- Never mark a requirement `done` in `TRACEABILITY.md` without a passing test or a recorded manual check (a screenshot path counts).
</integrity_rules>

---

## 7. Testing and verification

| Layer | Tool | Must cover |
| --- | --- | --- |
| Python unit | pytest | Every invariant in §5, run-length logic, event detection, partial-disk visibility on synthetic horizons, contract writers (dtype, shape, offsets) |
| TS unit | vitest | `engine.ts` functions, finder scoring and ranking, the difference-text generator, contract readers |
| Parity | `make parity` | Python vs TS engine on `shared/fixtures`: angles within 1e-4°, metrics identical |
| Validation | `make validate` | Engine az/el vs Horizons topocentric output at the spec's validation sites (target < 0.1°); lit/dark pattern vs the PGDA illumination map at the polar sites |
| End to end | Playwright | The spec's 3-minute demo script as a test: open site → scrub to sunset → slip date → constraint fails → run finder → open top result in 3D → nudge → Explorer mode |
| Performance | `make perf` | Finder at the spec's size (e.g. 5,000 candidates × 60-day slip) under the spec's time target; initial data load under the spec's MB budget; report the 3D frame rate from a Playwright run |

**Look at your UI.** For every user-facing feature, capture Playwright screenshots in `web/tests/screenshots/` and read them. Check that labels are readable, the HUD values match the engine, nothing overlaps, and the 3D view isn't black or empty. Fix what you see before ticking the item.

**Before claiming any phase is done,** run `make check` from a clean state (`git stash -u` is not needed; just a fresh `make` run) and paste the summary into `PROGRESS.md`.

---

## 8. Code standards

- **Write exactly what the spec requires.** No speculative features, no abstraction layers without a second caller, and no decorative styling beyond what the spec describes. Clear and small beats clever.
- TypeScript in `strict` mode. Python with type hints, formatted and linted with `ruff`.
- `engine.ts` is pure: no DOM, no React, no globals. The UI and the worker both import it.
- HUD and panel numbers always come from the engine, never from the 3D renderer.
- The 3D scene uses local metric coordinates centered on the site. Build it as the spec describes: heightmap mesh, directional Sun with shadows, Earth sprite at true angular size, and a far-field silhouette ring from the mask.
- The app makes **no runtime network calls**. Everything comes from `web/public/data/`.
- The UI footer and README state screening-grade accuracy and the spec's non-goals.

---

## 9. Autonomy and when to stop

Work without asking questions. When the spec leaves a choice open, pick the simplest option that satisfies it, log it in `DECISIONS.md`, and continue.

<stop_conditions>
Stop and report, without guessing, only if:
- a credential, API key or paid account is required;
- an action would delete or overwrite anything outside this repo;
- the spec contradicts itself in a way that changes a scientific result, and the conservative reading is unclear. Write both readings in `DECISIONS.md` and stop at that item; keep working on independent items first.
</stop_conditions>

Long-running work: if a command will take more than a few minutes (downloads, full-grid mask generation), run it in the background. Meanwhile, keep working on independent tasks, and check its log before depending on its output.

---

## 10. Definition of done

- Every **M** requirement in `TRACEABILITY.md` is `done`, each with a test or a recorded check. **S** items are done in the spec's order as time allows. **C** items only after every M passes.
- `make check` and `make validate` pass. Measured values are in `docs/VALIDATION.md`, and the spec's success metrics are each marked met or not met, with numbers.
- `make build` produces a static site that works when served from any static host. Document a one-line deploy command for Vercel or GitHub Pages in the README.
- The Playwright demo-path test passes, and screenshots of each demo step are saved.
- `README.md` is rewritten. It covers:
  - what tranquility base is;
  - quick start (`make setup && make data && make dev`);
  - the data sources with credits (NASA/JPL, LRO LOLA via PGDA, CSA content);
  - the architecture in five lines;
  - the validation results;
  - limits and non-goals;
  - whether any synthetic data remains.

**Final report** (your last message, and a copy at the end of `PROGRESS.md`):

1. A requirement-by-requirement status table.
2. The validation and performance numbers.
3. Any fallbacks or synthetic data still in use.
4. Open issues, ranked by demo impact.
5. The exact commands to run, build and deploy.

---

## 11. Start now

1. Create the branch.
2. Convert the spec to `SPEC.md` and build `TRACEABILITY.md`.
3. Write `CLAUDE.md` and the `docs/` memory files.
4. Start the large DEM download in the background.
5. Freeze the data contracts and the fixtures.
6. Begin P0.
