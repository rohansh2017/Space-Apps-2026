# Tranquility Base — Lunar Landing Site Navigator: Consolidated Plan

> Converted from `Space Apps Doc.pdf` (23 pages, dated November 14, 2026) with `pypdf` layout extraction, then cleaned by hand. The PDF is the source of truth. Page markers `[p N]` show where each PDF page starts. The PDF's two diagrams (data flow, build phases) are already given as text in the PDF itself and are reproduced as such.

`[p 1]`

This is the single plan for the team. It merges our scope plan with the Tranquility Base PRD (version 2); the last section lists what each one missed.

## One-page summary

**What we built.** Tranquility Base is a web app where a mission planner picks a south-pole landing site and date, stands on the real terrain in 3D, and sees where the Sun and Earth sit against the true horizon. A constraint finder searches nearby sites and dates for ones that meet power and communication requirements. It explains each result as a plain-language difference from the original plan.

**Data sets used.** JPL DE440 ephemeris and NAIF lunar orientation kernels (the same JPL data behind Horizons, libration included), computed offline with Skyfield and checked against JPL Horizons. LRO LOLA south-polar DEMs and slope maps from NASA GSFC PGDA (the source behind Quickmap and Moon Trek) for terrain, horizon masks and slopes. Quickmap and PGDA illumination maps to validate our lit/dark results. NASA Artemis III and CLPS releases and the USGS Gazetteer of Planetary Nomenclature for site coordinates. CSA Moon Exploration for mission context and Explorer text.

**What it looks like.** A first-person 3D view of the lunar surface, with the Sun and Earth in the sky. A HUD shows solar elevation, time to sunset, time to Earthset and link status. A constraint panel, results list, scenario matrix and 360° horizon panorama sit beside it. Planner mode shows exact numbers. Explorer mode adds plain-English labels and a guided tour.

**How we present it.** A 3-minute live demo of one real story. China called off Chang'e-7's August 2026 launch to the Shackleton rim, and no new date has been announced (Space.com). We show the site losing sunlight at a later date, run the finder, and walk the best alternative in 3D. A one-page handout and a recorded backup video tell the same story. The first crewed south-pole landing has also moved, to Artemis IV in early 2028 (spacelaunchschedule.com), so slips are the normal case.

**Sponsor prizes.** We also enter the Cloudflare and Gemini API prizes. The app runs on Cloudflare Workers, with ephemeris, mask and heightmap files in R2 and a Durable Object mission room where teammates share one site and date. Gemini turns a typed requirement such as "survive 4 days of dark, talk to Earth half the time" into constraint JSON that we validate, and describes the horizon panorama in words. Every number still comes from the engine.

`[p 2]`

## Problem, users and boundaries

At the south pole the Sun stays within about 1.5° of the horizon, so terrain decides whether a site is lit, and a 100 m move can swing illumination from most of the time to almost none. Earth sits low and drifts in and out of view with libration. Quickmap, Moon Trek and Horizons hold the data, but checking one site and date means moving between specialist interfaces. When a launch slips, planners have to re-check many alternatives quickly.

| User | Core question | What Tranquility Base gives them |
| --- | --- | --- |
| Mission planner or engineer | Our landing date slipped. What still works? | Constraint finder with ranked alternatives, scenario matrix, exact metrics |
| Science team member | Can we reach the target, and when is it lit? | Site view on real terrain, shadow timing, Earth link windows |
| Educator, student, public | Why is the south pole so hard? | Guided tour, plain-language labels, the 3D view itself |

**Vision:** in under a minute, anyone can see what a landing site is like and whether it meets mission needs. In under five minutes, a planner can find a replacement when the plan changes.

**What it is:** a web app with a 3D surface view, a horizon panorama, a comparison panel and a constraint-based site and date finder. It is built on real JPL ephemeris and real LRO terrain, focused on the south polar region (80–90°S), with a curated site list and custom coordinates inside the precomputed regions. It has one interface with two modes (Planner and Explorer). It is fully static at runtime: ephemeris, terrain and horizon data are precomputed offline in Python and served as files, and the app makes no calls to Horizons, Quickmap or Moon Trek while running.

**What it is not:**

- Not a mission design tool: no trajectories, fuel or launch windows.
- Not a landing hazard assessment: slope screening is an aid only.
- Not a power or thermal simulation: power is a relative index from Sun visibility and elevation.
- Not a communications link budget: geometric Earth visibility only, with no antenna, data rate or ground-station model.
- Not a replacement for Horizons, Quickmap or Moon Trek: it builds on them and links back.
- Not global: sites north of 80°S (equatorial, far side, and lower-latitude targets such as Chandrayaan-3) are out of scope for terrain. Apollo 11, 15 and 17 are used only to validate Sun and Earth angles.

## Requirements

`[p 3]`

Every challenge objective is covered by at least one must-have item. M = must have for the demo, S = should have, C = could have. Objectives: 1 site selection, 2 date and time, 3 Sun and Earth view, 4 power and comms, 5 multiple visualizations, 6 temporal dynamics, 7 accessibility. F21 and F22 use Gemini and F23 and F24 use Cloudflare, for the two sponsor prizes. Prize in the Obj. column means the item serves a prize only.

| ID | Requirement | Pri. | Obj. |
| --- | --- | --- | --- |
| F1 | Curated site list (Artemis III candidate regions, 2022 Shackleton benchmarks, CLPS and international targets, Apollo 11, 15 and 17 for angle validation) plus custom latitude/longitude entry and a map click, snapped to the nearest precomputed grid point | M | 1 |
| F2 | Date and time picker (UTC) with a lunar-day scrubber covering 2026 to 2035 | M | 2, 6 |
| F3 | First-person 3D scene from LOLA terrain at 2 m eye height: Sun and Earth at true azimuth and elevation, near-terrain shadows, and a far-field silhouette ring so the Sun sets behind mountains 100+ km away | M | 3, 5 |
| F4 | HUD: solar elevation, Earth elevation, lit and link status, power index, countdowns to sunset and Earthset (or sunrise and Earthrise when dark) | M | 3, 4 |
| F5 | Horizon panorama: unrolled 360° terrain silhouette with Sun and Earth tracks over the selected window. Also the fallback if 3D is late | M | 3, 5, 6 |
| F6 | Constraint panel with presets (Static lander, Rover, Short CLPS): see Constraint finder for the list and defaults | M | 4 |
| F7 | Constraint finder: ranked alternative dates at the same site and nearby sites within a radius, pass or fail per constraint | M | 1, 2, 4 |
| F8 | Plain-language difference from the original plan, e.g. "1.4 km NE, 2 days later: +9% sun, −31 h dark, −5% comms" | M | 4, 7 |
| F9 | Planner and Explorer modes: raw numbers versus plain-English labels and glossary tooltips | M | 7 |
| F10 | Scenario matrix: sites as rows, days as columns, cells colored by the chosen metric, click to open 3D. Spanning a year, it shows the seasonal swing | S | 1, 2, 5 |
| F11 | Side-by-side comparison of baseline and alternative (split 3D or paired panoramas) | S | 1, 5 |
| F12 | Lunar-day playback (one lunar day in about 20 s) with Sun and Earth trails | S | 6 |
| F13 | Guided tour in Explorer mode: "Why is the pole so hard?" in 3 steps, contrasting with an Earth sunrise; content and glossary from a static tour.json | S | 7 |
| F14 | Nudge control: move the site 100 m or the date one day and animate the change in metrics | S | 1, 2, 7 |
| F15 | Top-down illumination map (sunlit % per grid point) around the site | S | 5 |
| F16 | Slope screening in the finder (default maximum 10°) from a slope grid computed with numpy.gradient on the 20 m DEM and checked against the LOLA slope map | S | 1 |
| F17 | Shareable URL that encodes site, date and constraints | S | 7 |
| F18 | Solar array presets (vertical mast vs horizontal deck) for the power index | C | 4 |
| F19 | Export a scenario summary as CSV or PDF | C | 7 |
| F20 | Lunar Night Survivor game mode, reusing the engine and HUD | C | 7 |
| F21 | Natural-language constraint entry: a typed sentence becomes constraint JSON through Gemini, is validated against the schema, and is shown in the constraint panel for confirmation before the finder runs | S | 7 |
| F22 | Gemini horizon description: a short plain-language description of the panorama (where the Sun and Earth tracks meet the ridgeline), written from engine-derived facts, labeled as generated, with a template fallback | C | 7 |
| F23 | Deploy on Cloudflare at a live public URL: Workers static assets for the app, R2 for ephemeris, mask and heightmap files fetched by region on demand | M | Prize |
| F24 | Mission room: a Durable Object holds one site, date and constraint set per room; teammates join by link and stay in step over WebSockets. Each client still runs the engine locally | S | Prize |

`[p 4–5]` (table continues across pages 3–5)

### Objective coverage

| Objective | How Tranquility Base meets it | Reqs |
| --- | --- | --- |
| 1. Site selection and comparison | Curated Artemis III, Shackleton benchmark, CLPS, international and Apollo sites, custom coordinates, finder results, matrix, side-by-side, nudge | F1, F7, F10, F11, F14 |
| 2. Date and time flexibility | Date picker, lunar-day scrubber, slip-range search across ten years of precomputed ephemeris, matrix across seasons | F2, F7, F10, F14 |
| 3. Sun and Earth visualization | 3D sky against the true horizon, panorama, HUD countdowns to sunset and Earthset | F3, F4, F5 |
| 4. Power and comms assessment | Solar elevation, sunlit duration, longest dark, Earth visibility windows, pass or fail per constraint, power index | F4, F6, F7, F8, F18 |
| 5. Multiple visualizations | 3D surface, unrolled panorama, scenario matrix, top-down illumination map | F3, F5, F10, F15 |
| 6. Temporal dynamics | Scrubber, playback with trails, Sun and Earth tracks across the mission window | F2, F5, F12 |
| 7. Accessibility across skill levels | Planner and Explorer modes, plain-language differences, guided tour, shareable links, Gemini sentence entry and horizon description | F8, F9, F13, F17, F21, F22 |

### Potential considerations

`[p 6]`

- **Ephemeris:** JPL DE440 and the lunar orientation kernel through Skyfield, the same JPL data Horizons uses, so libration and orbital variation are included. Results are checked against Horizons topocentric output.
- **Topography:** the LOLA 20 m and 80 m DEMs drive the horizon masks, the 3D heightmaps and the slope grid.
- **No atmosphere:** the horizon is geometric, set by terrain and lunar curvature, with no refraction.
- **Solar elevation:** the first number on the HUD and the main input to the power index.
- **Time to sunset and Earthset:** the largest numbers on screen.
- **Seasons:** the Moon's 1.54° axial tilt changes how high the Sun gets at the pole over the year. The matrix (F10) and multi-year scrubber make this visible.
- **Lunar vs terrestrial conditions:** the Sun skims the horizon and shadows are black. The tour contrasts this with an Earth sunrise.
- **Why small changes matter:** the nudge control and the grid search show sunlight changing across a few hundred meters.
- **Steep slopes and deep craters:** captured by the horizon mask and shadows. Sites that never see the Sun in the window are flagged.

## Constraint finder

The finder turns "our date slipped" into a search: users set requirements, the engine scans site and date pairs, and results come back ranked by margin.

### Constraints and defaults

Defaults are editable placeholders, not NASA requirements.

| Constraint | Default | Why planners care |
| --- | --- | --- |
| Mission duration | 7 Earth days from landing | Sets the evaluation window |
| Minimum continuous sunlight | 6 days | Keeps a solar-powered lander running through the mission phase |
| Maximum continuous darkness | 80 hours | Sets the survival requirement through a dark period |
| Minimum Earth visibility | 40% of mission time | Direct-to-Earth communication opportunity |
| Minimum Earth elevation | 1° above the terrain mask | Antenna pointing limit; keeps the link clear of the horizon |
| Landing-time condition | Sun and Earth both visible at touchdown | Landing operations need both power and a link |
| Maximum terrain slope (S) | 10° | Screening for landing feasibility |
| Slip range / search radius | ±30 days / 5 km | How far the search may move the plan |

`[p 7]`

### How the search works

1. **Input:** constraints come from the panel or a preset. With Gemini entry (F21), the user types a sentence such as "survive 4 days of dark, talk to Earth half the time". A Worker sends it to Gemini with constraints.schema.json as the response schema. The browser validates the reply against the same schema, rejects unknown fields and out-of-range values, and fills the panel (here: maximum continuous darkness 96 hours, minimum Earth visibility 50%). The user can edit the values, and the finder runs only after they confirm. Gemini never receives or returns engine results.
2. **Candidates:** the chosen site, the curated sites, and a regular grid within the search radius (500 m spacing), crossed with start dates across the slip range (hourly or daily steps).
3. **Evaluation:** for each pair, Sun and Earth visibility hour by hour over the mission window. Run-length encoding gives the longest lit and dark runs; a sliding window gives the Earth-visible fraction.
4. **Ranking:** pass or fail per constraint, then a margin score: distance from each threshold, normalized and weighted by the user.
5. **Explanation:** compare each result to the original plan and write a one-line difference.
6. **Drill-down:** opening a result loads it in 3D and the panorama at the best landing time.

### Metric definitions (one definition everyone uses)

| Metric | Definition | Explorer label |
| --- | --- | --- |
| Sun visible fraction | Share of the 0.53° solar disk above the mask, 0 to 1, per hour | "Half the Sun is behind the ridge" |
| Sunlit % | Mean Sun visible fraction over the window | "Sunny 82% of the mission" |
| Longest lit / dark run | Longest run of hours with fraction > 0 / = 0 | "Must survive 61 h of darkness" |
| Earth visible | Earth center at least 1° above the mask | "Can call home 47% of the time" |
| Power index | Visible fraction × cos(solar elevation) for a vertical mast (default); × sin(elevation) for a horizontal deck (F18) | Battery-fill icon |
| Event times | Next sunset, sunrise, Earthset, Earthrise from t | "Sunset in 4 d 6 h" |
| Mean elevation while lit | Mean solar elevation over lit hours | Shown in Planner mode only |

`[p 8]`

## Data and science

Skyfield turns the JPL DE440 kernels into one site-independent table of Sun and Earth directions. LOLA DEMs give a 360° horizon mask per point. Visibility is just "elevation above the mask", so everything else is cheap. Nothing is fetched from a live API at runtime, and synthetic data is used only as development fixtures.

### Data products

| Need | Source | Exact product | Notes |
| --- | --- | --- | --- |
| Sun and Earth directions, hourly 2026–2035 | JPL DE440 + NAIF lunar kernels via Skyfield | de440s.bsp (~32 MB, 1849–2150; full de440.bsp, ~114 MB, works the same), moon_pa_de440_200625.bpc, moon_de440_220930.tf | Computed offline. The app never calls an ephemeris service |
| Angle validation | JPL Horizons API | Topocentric azimuth and elevation (quantity 4), target 301 | Listed challenge resource. Development only, never called by the app. Moon longitudes are east-positive |
| Near-field terrain, 3D heightmaps, grid masks | LOLA polar DEMs, PGDA 90 | LDEM_80S_20MPP_ADJ.TIF (2.6 GB) | Same LOLA data Quickmap and Moon Trek show. Newer adjusted release; older PDS copies on USGS Astrogeology are a backup only. Start the download at hour 0 |
| Far-field terrain (10–300 km) | Same page | LDEM_80S_80MPP_ADJ.TIF (~181 MB) | Covers ±304 km around the pole. Build everything on it until the 20 m file lands |
| Slopes (S) | Same page | LDSM_80S_20MPP_ADJ.TIF | Check for our numpy.gradient slope grid (F16) |
| Close-up detail (C) | PGDA 81, PGDA 78 | 5 m/px mosaic and site DEMs | Only for 3D close-ups |
| Lit/dark validation | Quickmap Average Solar Illumination layer (by hand); Mazarico illumination, PGDA 69; LROC WAC illumination % | Average-illumination GeoTIFF | Quickmap for the judges' Q&A, PGDA for a scripted check |
| Site coordinates | NASA Artemis III release (October 2024), NASA CLPS pages, USGS Gazetteer of Planetary Nomenclature (CSV) | Region centers, landing points, feature centers | Gazetteer coordinates are feature centers, not landing points |
| Site map basemap (S) | LOLA hillshade | Rendered offline from the 80 m DEM | Static image; no streamed tiles |
| Mission context, Explorer text | CSA Moon Exploration, NASA mission pages | Saved as tour.json | Our own words, credited |

`[p 9–10]`

Links: PGDA 90 https://pgda.gsfc.nasa.gov/products/90 · PGDA 81 https://pgda.gsfc.nasa.gov/products/81 · PGDA 78 https://pgda.gsfc.nasa.gov/products/78 · PGDA 69 https://pgda.gsfc.nasa.gov/products/69 · Horizons API https://ssd-api.jpl.nasa.gov/doc/horizons.html · LROC WAC illumination https://data.lroc.im-ldi.com/lroc/view_rdr/WAC_POLE_ILL_PCT_SOUTH

### Curated sites

| Site | Lat, lon (°) | Role |
| --- | --- | --- |
| Shackleton rim, Chang'e-7 target | −88.8, 123.4 | Demo story (international program) |
| Mons Mouton, IM-2 landing | −84.78, 29.13 (LROC) | CLPS target |
| 9 Artemis III candidate regions (October 2024) | Region centers read from NASA's map, labeled approximate (regions are about 15 × 15 km) | Peak near Cabeus B, Haworth, Malapert Massif, Mons Mouton Plateau, Mons Mouton, Nobile Rim 1 and 2, de Gerlache Rim 2, Slater Plain |
| 2022 Shackleton benchmarks: Connecting Ridge (Barker Site 01), Peak near Shackleton, Faustini Rim A | Connecting Ridge from the PGDA 78 README; others from NASA's 2022 region map | On NASA's 2022 list, dropped in 2024. Kept as high-illumination benchmarks for validation, not as Artemis III candidates |
| Apollo 11, 15 and 17 | Approx. 0.67, 23.47; 26.13, 3.63; 20.19, 30.77 | Sun/Earth angle validation only, no terrain |
| Named craters and massifs | USGS Gazetteer CSV | Labels and cross-checks only |

`[p 11]`

### Calculation pipeline

1. **Direction table (offline, Python):** load de440s.bsp, the lunar orientation kernel and its frame kernel in Skyfield. For every hour 2026–2035 (~87,700 steps), compute apparent Sun and Earth positions from the Moon's center and rotate them into MOON_ME_DE440_ME421. Store the Sun unit vector, Earth unit vector and Earth distance as Float32, one file per year (~250 KB each). These do not depend on the site, so one table serves every location.
2. **Angles per site (browser):** rotate the stored vectors into the site's local east/north/up frame, built from its latitude, longitude and elevation. This is the "offset from the pole" done exactly, at the same cost. Storing angles at 90°S and shifting them would be off by about 1° per 30 km from the pole (Malapert is ~120 km out), exactly where a Sun 1–2° above the horizon needs precision. Apply the finite-distance correction for Earth: up to about 0.26°, since the Moon's radius (1,737 km) is that fraction of Earth's distance (~384,400 km). The Sun's correction is under 0.001° and ignored.
3. **Horizon mask (offline, Python):** for each of 360 azimuths, ray-march from 2 m above the terrain out to ~300 km. Use the 20 m DEM inside 10 km and the 80 m DEM beyond, with steps growing with distance (about 0.5% of d). Subtract the curvature drop d²/(2R), R = 1,737.4 km, and keep the highest angle. Use numba with parallel=True.
4. **Visibility:** a body is visible when its elevation exceeds the mask at its azimuth, with linear interpolation between the 1° bins. The Sun is a 0.53° disk, so partial occlusion gives a fraction between 0 and 1.
5. **Metrics:** as defined in Constraint finder.
6. **3D heightmaps (offline, Python):** with rasterio and NumPy, crop a 5 × 5 km patch of the 20 m DEM around each curated site, resample it to 256 × 256 (~20 m per cell), and export a 16-bit PNG with its height offset and scale in the site metadata. The far silhouette ring comes from the site's mask.
7. **Slopes (offline, Python):** compute slope with numpy.gradient on the 20 m DEM at each grid point, check it against the LOLA slope map, and store it with the site and grid metadata.
8. **Storage:** yearly ephemeris files (~2.5 MB total), the site list, one mask file per search region (720 bytes per point, ~4 MB for 5,300 grid points) and one heightmap per curated site (~130 KB or less). Region files load on demand when the search radius reaches them. The browser computes visibility on the fly in a Web Worker.

### Accuracy decisions

- **One frame for everything: MOON_ME_DE440_ME421.** The LOLA DEMs use the DE421 mean-Earth frame. The frame kernel moon_de440_220930.tf defines MOON_ME_DE440_ME421 to match it, so Sun and Earth directions are rotated into that frame. The PA and ME frames differ by ~0.029°. That is a tiny error in Sun or Earth angles, but ~875 m on the surface if a site coordinate from one frame is placed on a DEM in the other (NAIF). At the pole, 875 m changes the answer.
- **Far terrain counts.** Ray-march to ~300 km, not 100 km: Malapert and Mons Mouton sit 120–160 km from the pole and form the horizon for many polar sites.

`[p 12]`

- **Azimuth resolution:** 1° bins with interpolation, coarser than the 0.53° solar disk. Spot-check five sites against 0.25° bins and move to 720 bins if lit time differs by more than one hour per lunar day.
- **Geometric horizon:** no atmosphere, so no refraction.
- **Observer height:** 2 m above terrain by default for masks and the 3D camera. It matters at low Sun angles.
- **Earth rule:** Earth's disk is ~1.9° seen from the Moon. We call Earth visible when its center is at least 1° above the mask.
- **Screening grade:** the search grid uses 500 m spacing, with 20 m terrain within 10 km and 80 m beyond, so results can miss small boulders. Custom coordinates snap to the nearest precomputed grid point (at most 500 m away) and the app shows the snap distance. The app footer and README say this.

### Validation plan

- Compare Skyfield azimuth and elevation with Horizons topocentric output (quantity 4) at six sites (Apollo 11, 15 and 17 plus three polar) over one lunar month. Target: under 0.1°. Check one site in P0, before anything builds on the table.
- Compare lit and shadowed patterns at five polar sites with Quickmap's Average Solar Illumination layer (by hand, for the judges' Q&A) and the PGDA illumination map (scripted). Explain differences by DEM resolution, observer height and time window. Connecting Ridge should come out among the best-lit.
- Unit-test the stereographic conversion, the local-frame rotation, run-length logic, event detection, mask interpolation and partial-disk visibility on synthetic horizons.

## Architecture

Static-first: Python precomputes the ephemeris table, masks, heightmaps and slopes once, and the browser does all live work in a Web Worker. The science path makes no live API calls and streams no map tiles. The only runtime calls are the optional Gemini routes and the mission room WebSocket, both on Cloudflare. A small API is optional, only if custom coordinates outside the precomputed regions become a requirement.

**Data flow (diagram, as text):**

- **Sources:** JPL DE440 kernels (Skyfield, offline) · LOLA DEMs (20 m near, 80 m far) · [check] Validation sources (Horizons, Quickmap, PGDA)
- **Built offline:** Direction table (hourly vectors, 2026–2035) · Masks + heightmaps (numba ray-march to 300 km) · [check] Cross-checks (angles under 0.1°, lit vs maps)
- **Served:** Cloudflare: the app on Workers static assets; ephemeris, masks, heightmaps and sites in R2, loaded per region (under 10 MB to start) · [fallback] Optional API (only for points outside the regions)
- **Edge:** Cloudflare Worker with Gemini routes for sentence entry and panorama text · [optional] Durable Object mission room (shared site, date, constraints)
- **Browser (React):** Engine worker (visibility, finder) → Slip finder (constraints, results) → Horizon panorama (Sun, Earth tracks) → Tranquility Base 3D (terrain, HUD)

Checks and fallbacks are not runtime dependencies.

`[p 13]`

### Components

- **Offline build (Python):** Skyfield with DE440 and the lunar kernels for the ephemeris table; rasterio and NumPy for DEM crops, heightmaps and slopes; numba horizon masks for curated sites and their 21 × 21 search grids; Horizons requests for validation only. One `make data` command regenerates everything. A Python reference engine computes the same metrics for validation.
- **Engine (TypeScript):** one engine.ts module (local-frame rotation, angles, visibility, run lengths, events, scoring) shared by the Web Worker and the UI. A parity test checks it against the Python reference on fixed inputs.
- **Finder in a Web Worker:** for each candidate point, compute the visibility series once over slip range + mission window (~1,600 hours). Prefix sums and run segments then score every start time in O(1). Daily start steps by default, refined hourly around the top results.
- **Custom coordinates:** snap to the nearest precomputed grid point (at most 500 m away) and show the snap distance. Points outside the regions get a clear message unless the optional API is built.
- **3D view:** react-three-fiber in local metric coordinates centered on the site (avoids float precision issues). A 256 × 256 heightmap displaces a plane mesh over 5 × 5 km, the Sun is a directional light with a shadow map for near terrain, and Earth is a sprite with its real angular size. A far-field silhouette ring built from the mask makes the Sun set behind distant mountains. HUD numbers always come from the engine, never from the renderer.
- **Hosting:** the app deploys to Cloudflare Workers static assets at a live public URL. The optional API, if built, runs in Docker on Render or Fly.io, because it needs the Python build stack.
- **Data in R2:** ephemeris, mask, heightmap and slope files are uploaded to an R2 bucket under the paths in the data contracts and fetched by region on demand, so the first load stays small. R2 has no egress fees. A local build with the same files is the backup.
- **Mission room (Durable Object):** one object per room ID holds the shared site, UTC time and constraint values. Browsers connect over WebSockets and send small state changes, and the object broadcasts them. Every client still runs the engine locally, so the object stores and relays state and computes nothing.
- **Gemini routes (Worker):** one route turns a sentence into constraint JSON, using constraints.schema.json as the response schema. Another takes engine-derived horizon facts (peak azimuths and elevations, Sun and Earth track events) and returns a short description. Both calls use a key held as a Worker secret. The browser rejects constraint JSON that fails the schema and shows the description as generated text. If the description contains a number that is not in the input facts, or the call fails, a template sentence is used instead.

### Data contracts (freeze at hour 1)

`[p 14]`

| File | Contents |
| --- | --- |
| ephemeris/{year}.bin + ephemeris.json | Float32 per hour in MOON_ME_DE440_ME421: Sun unit vector (3), Earth unit vector (3), Earth distance km (1); start time and step in the JSON |
| masks/{region}.bin + points.json | Uint16 × 360 per point (elevation in 0.01°, offset +10°); points list with id, lat, lon, stereographic x/y, region, parent site |
| sites.json | Curated sites: id, name, lat, lon, coordinate source, approximate flag, mission, agency, blurb, links, heightmap offset and scale |
| heightmaps/{site}.png | 16-bit PNG, 256 × 256 over 5 × 5 km |
| slopes/{region}.bin (S) | Uint8 slope per grid point, from numpy.gradient |
| tour.json | Explorer tour steps and glossary, written from CSA and NASA material |
| constraints.schema.json | Constraint set: id, type, unit, min, max and default for each constraint. Read by the panel, the Gemini response schema and the browser validator |
| room message (JSON) | Site id, UTC time, constraint values and sender; relayed by the mission room, which keeps the latest copy for late joiners |

Frontends build against mock files of exactly these shapes from hour 1. In R2 the files keep these paths.

### Stack

| Layer | Choice |
| --- | --- |
| Offline build | Python 3.11, Skyfield (DE440 + lunar kernels), rasterio, NumPy, numba; requests for Horizons validation only |
| Frontend | React + TypeScript + Vite, react-three-fiber + drei, D3 + Canvas for panorama, matrix and timelines, MapLibre over a static LOLA hillshade for the site map |
| Compute | Web Worker with typed arrays; optional small API |
| Hosting | Cloudflare Workers static assets and R2; Render or Fly.io for the optional API |
| Edge and AI | Cloudflare Worker routes, Durable Object mission room, Gemini API (key held as a Worker secret) |

`[p 15]`

### Performance targets

| Target | Value |
| --- | --- |
| 3D frame rate on a typical laptop | 30 fps or more |
| Finder: 5,000 candidates × 60-day slip range | Under 3 s |
| Initial load for the demo regions | Under 10 MB |

## Team and build order

The plan assumes about 48 hours. The complete demo (all seven objectives, deployed) lands by hour 32. That is the cut line: should-haves come after it, and submission prep starts 6 hours before the deadline (H42) whatever phase we are in. If the event is shorter, scale every phase by the same ratio.

**Build phases (diagram, as text):** Setup H0–H3 (contracts, mocks, data) → Engine H3–H12 (one site end to end) → [M1 at H12: engine within 0.1°, 1 site live] → Core H12–H22 (finder and 3D, real data) → [M2 at H22: finder under 3 s, opens in 3D] → Complete H22–H32 (all 7 goals, deployed) → [M3 cut line at H32: all 7 objectives in deployed app] → Extras H32–H42 (matrix, tour, nudge, polish) → Submit H42–H48 (script, video, one-pager).

### Roles

| Role | Owns | Requirements |
| --- | --- | --- |
| A: Ephemeris + engine | Skyfield ephemeris files, Python reference engine, engine.ts + finder worker, Horizons validation, constraints.schema.json, Gemini sentence-entry route and validator | F2, F7 engine, validation, F21 |
| B: Terrain + masks | DEM download and crops, stereographic math, numba masks for sites and grids, heightmaps, slopes, grid snapping, illumination validation, R2 bucket and upload, mission room Durable Object | F1 custom, F15, F16, F24 |
| C: 3D Tranquility Base | Scene, heightmap mesh, Sun light and shadows, Earth sprite, silhouette ring, HUD, playback, guided tour and tour.json | F3, F4, F12, F13 |
| D: App, finder UI, story | App shell, site list and map, panorama, constraint panel, results and diffs, matrix, modes, URL state, Cloudflare deploy, horizon description (Gemini), demo script, video, one-pager | F1, F5–F11, F14, F17, F22, F23 |

`[p 16]`

### Tasks by phase

**P0 Setup (H0–H3), everyone.** Exit: Skyfield returns Sun and Earth directions for one hour in MOON_ME_DE440_ME421 that match Horizons at one site, and the DEM opens in rasterio.

- [ ] Freeze data contracts (including constraints.schema.json and the room message) and metric definitions; commit mock files of those shapes
- [ ] Repo with /build, /web, /api; Vite app and Python env run
- [ ] Cloudflare account, Worker project and R2 bucket created; an empty app deploys to a public URL; Gemini key stored as a Worker secret and one test call returns JSON
- [ ] Start downloads: LDEM_80S_20MPP_ADJ first (2.6 GB), then LDEM_80S_80MPP_ADJ, the slope map, de440s.bsp and the lunar kernels
- [ ] Finalize the curated site list with a source per site (Artemis region centers, 2022 benchmarks, CLPS, Apollo 11, 15 and 17)

**P1 Engine + skeletons (H3–H12).** Exit (M1): Skyfield angles match Horizons within 0.1° at 3 sites; a real mask and track show in the panorama for one site.

- [ ] A: Skyfield ephemeris files for 2026–2035; local-frame rotation; Python engine; topocentric check at 3 sites
- [ ] B: stereographic conversion with tests; mask for one site on the 80 m DEM, then 20 m + 80 m
- [ ] C: scene from a mock heightmap: mesh, 2 m camera, directional light, look controls
- [ ] D: app shell with site list, time scrubber and panorama on mocks

**P2 Core on real data (H12–H22).** Exit (M2): a slipped-date scenario returns ranked alternatives in under 3 s and opens in 3D with HUD values equal to engine values.

- [ ] A: engine.ts + parity test; finder worker with run lengths and prefix sums
- [ ] B: masks for all curated sites and grids; heightmaps; grid snapping
- [ ] C: real heightmaps, silhouette ring, Earth sprite, HUD bound to the engine, shadows
- [ ] D: constraint panel with presets, ranked results, pass/fail chips, diff text, click-through to 3D

`[p 17]`

**P3 Complete demo (H22–H32).** Exit (M3, cut line): all seven objectives shown in the deployed app.

- [ ] A: lit/dark validation against Quickmap and PGDA; numbers for the validation slide
- [ ] B: custom-coordinate snapping in the UI; slope grid ready; data files uploaded to R2 and loaded by region
- [ ] C: playback with trails; performance pass to 30 fps
- [ ] D: Planner/Explorer modes and labels, basic scenario matrix, deploy to Cloudflare with data served from R2

**P4 Should-haves (H32–H42, in this order).** Exit: someone outside the team completes the tour unaided.

- [ ] Side-by-side compare (F11), nudge control (F14), guided tour (F13)
- [ ] Mission room (F24): Durable Object with WebSocket sync of site, date and constraints; two browsers stay in step
- [ ] Gemini sentence entry (F21), then the horizon description (F22) if time remains
- [ ] Illumination map (F15), slope screening (F16), shareable URL (F17)

**P5 Submission (H42–H48).** Exit: two full demo runs under 3 minutes, backup video recorded.

- [ ] One-page summary with a 3D screenshot; README with data credits and the non-goals
- [ ] Prize slides: one slide listing the Cloudflare products used (Workers static assets, R2, Durable Objects) and one on how Gemini is used; confirm each prize's submission steps
- [ ] Rehearse the script twice; record the backup video; bug bash on the deployed URL

**Stretch (only after M3, only if ahead).** Lunar Night Survivor (F20): pick a site and date, set battery and load, play one lunar day. Power = array area × efficiency × visible solar fraction − load. A 2D side view is fine. Done when three sites are playable with a debrief that compares the player's site with the finder's best alternative.

### Cut list (cut from the top when a gate is missed)

1. Stretch game and the Gemini horizon description (F22), then the remaining should-haves (F15–F17)
2. Mission room (F24). Without it Cloudflare is hosting only, so drop the Cloudflare prize entry; F23 stays
3. Gemini sentence entry (F21), and with it the Gemini prize entry
4. Side-by-side compare and the scenario matrix
5. Custom coordinates (curated sites only)
6. Grid search (date-slip search at fixed sites only)
7. Near-terrain shadows (keep the silhouette ring: it carries the far-terrain story)
8. The 3D view itself (panorama + finder still cover every objective)

`[p 18]`

## Demo, judging and success metrics

### Demo script (3 minutes)

1. **0:00** State the problem in one sentence. Open at the Shackleton rim (Chang'e-7's target) with the Sun skimming the horizon.
2. **0:30** Point out the HUD countdowns to sunset and Earthset. Scrub until the Sun drops behind a ridge; show the same moment in the panorama.
3. **1:00** "Chang'e-7 missed its August window." Slip the landing date. The site fails the continuous-sunlight constraint.
4. **1:20** Run the finder, typing the requirement as a sentence first if Gemini entry is built. Ranked alternatives appear with written differences.
5. **1:50** Open the top result in 3D; show the panorama and matrix next to the original plan.
6. **2:20** Nudge the site 100 m and show sunlit time change; if the mission room is built, a second browser follows.
7. **2:40** Switch to Explorer mode, credit the data sources, and close on the validation result (engine vs Horizons, lit/dark vs PGDA).

If a should-have is missing, skip its step; steps 1–4 and 7 only use must-haves.

### Judging alignment

Judges score two categories: Relevance (did the project address the call) and The Product (science, coding, communication and presentation, creativity). The last two rows cover the Cloudflare and Gemini sponsor prizes.

| Criterion | What we deliver | Evidence for judges |
| --- | --- | --- |
| Relevance | All seven objectives with the south-pole focus, Sun and Earth against the horizon, power and comms, fast scenario comparison | Objective table on the one-pager; demo built on a real slip |
| Science | JPL DE440 ephemeris with libration via Skyfield, checked against Horizons; LOLA horizon masks to 300 km, curvature, Earth parallax, partial solar disk, no atmosphere, one matched frame (MOON_ME_DE440_ME421) | Validation slide; data sources credited |
| Coding | Typed modular code, reproducible make data pipeline, engine parity and unit tests, in-browser search with workers | Public repo, test run, performance numbers |
| Communication | One clear story, readable HUD, plain-language results, Explorer mode, a one-page summary | One-pager, 3-minute script, backup video |
| Creativity | First-person view of real terrain as the evaluation tool, a finder that answers "what now?" in words, a nudge that shows why small moves matter | Live demo moments; optional game mode |
| Cloudflare prize | The platform runs core logic, not only hosting: Workers serve the app and R2 serves the data by region, and a Durable Object mission room syncs site, date and constraints between teammates over WebSockets | Live public URL; one slide listing the Cloudflare products used; two browsers in step during the demo |
| Gemini prize | Gemini is in front of users: a typed requirement becomes schema-validated constraint JSON, and Gemini describes the horizon panorama in words. The engine still computes every number | Demo moment at 1:20; schema check shown on a slide; description in the panorama panel |

`[p 19]`

### Success metrics

- Every M item works end to end in the deployed build.
- Engine agrees with Horizons within 0.1° in azimuth and elevation at the validation sites.
- Finder returns in under 3 s for 5,000 candidates and a 60-day slip range.
- The 3D view holds 30 fps on a typical laptop.
- Three people outside the team can say, after using the tool, why a small move at the south pole can cost days of sunlight.
- The demo runs in under 3 minutes twice in a row.
- If built: two browsers in one mission room stay in step, and a typed sentence fills the constraint panel with values that pass the schema.

## Risks and open questions

`[p 20]`

| Risk (by impact on the demo) | Mitigation |
| --- | --- |
| Scope creep (game, extra views) | Hard cut line at M3; stretch work starts only when its exit criteria pass |
| 2.6 GB DEM download or processing slower than planned | Build on the 80 m DEM first; start with 3–5 sites at 20 m; add grids later |
| Frame or projection bug (masks look wrong) | Everything in MOON_ME_DE440_ME421; unit-test stereographic math first; compare one site against PGDA at M1 |
| Skyfield kernel or frame setup surprises (wrong Sun and Earth angles) | Validate one site against Horizons in P0, before anything builds on the table; keep the ephemeris module isolated. Horizons is never a runtime dependency |
| Finder too slow in the browser | Typed arrays, prefix sums, daily start steps, regions loaded on demand, a 1 km grid if needed |
| 3D performance | 256 × 256 heightmaps, 2048 shadow map, a low-quality toggle; panorama as fallback |
| Results read as mission grade | State screening-grade accuracy, DEM resolution and non-goals in the app footer and README |
| Site coordinates are approximate | Record a source for every site, label region centers approximate, let users nudge the point |
| Gemini returns invalid or invented values, is rate limited, or is down | Schema-constrained output and browser validation; the user confirms the filled panel before the finder runs; the panel and presets work without Gemini; example sentences are tested before the demo |
| Gemini key exposed or abused | Key held only as a Worker secret, never in the bundle or repo; cap input length and requests per client |
| Mission room or WebSocket fails on the venue network | Each client runs the engine locally and works alone; the room only relays state; the demo skips that line |
| Cloudflare setup or R2 loading slower than planned | Empty app deployed in P0; keep a local build as the backup; if the mission room is not built, drop the Cloudflare prize entry rather than claim hosting alone |

`[p 21]`

### Open questions

- Event schedule and exact submission deadline. The plan assumes about 48 hours; if shorter, scale the phase hours.
- Submission format the judges require (one-pager, video length, repo link): confirm on the Space Apps NYC page.
- Who takes roles A–D.
- Artemis III region center coordinates, and which sites to feature in the demo.
- Search region size and grid spacing per region, to stay within the 10 MB load budget.
- Hosting for the live demo: deployed on Cloudflare, with a local build as backup.
- Cloudflare prize rules: whether the entry needs the cheat sheet's vote snippet (about ten lines), where it goes in the app, and what the one slide must list.
- Gemini access: which model and free-tier limits apply on the day, and how the prize submission shows that Gemini is in front of users.

## Reconciliation of the two writeups

The PRD (now version 2) was stronger on product definition, judging, the ephemeris pipeline and the static runtime; the scope plan was stronger on far terrain, accuracy pitfalls and the real slip story. This version keeps the better choice on each point. A dash means that writeup did not cover the topic.

| Topic | Scope plan | PRD v2 | This version |
| --- | --- | --- | --- |
| Feature list and priorities | Short MVP/stretch lists | F1–F19 with M/S/C and objective IDs | PRD list, with Planner/Explorer basics as a must (the tour stays a should) |
| Users, vision, non-goals | Missing | Full | Kept from the PRD |
| Judging, demo script, success metrics | Missing | Full, generic two-week slip | Kept, with the demo built on the Chang'e-7 slip |
| Constraint defaults, landing-time condition, Earth elevation limit | Missing | Full | Kept |
| Ephemeris source | SpiceyPy | DE440 via Skyfield, offline; Horizons for validation only | PRD v2 |
| Per-site angles | — | One vector table, rotated into each site's local frame | Kept. A pole-only angle table plus an offset was rejected: about 1° of error per 30 km |
| Earth parallax correction | Implicit in SPICE | Included (~0.26°) | Kept |
| Lunar frame | ~875 m risk, compute in MOON_ME | MOON_ME_DE440_ME421 | Both agree; the PRD names the exact frame |
| Compute and hosting | FastAPI backend, ~250 MB of visibility arrays | Fully static, no live calls or streamed tiles | PRD; an API only for points outside the regions. Hosting is Cloudflare (Workers, R2) for the sponsor prizes, and Gemini and the mission room are the only live calls |
| Exact data products | PGDA product names, 2.6 GB download risk | Same files with sizes | PGDA adjusted DEMs; USGS copies as backup only |
| Horizon distance | 300 km | 100 km | 300 km: Malapert and Mons Mouton are 120–160 km from the pole |
| Azimuth bins | — | 1° with interpolation, 0.25° spot-check | Kept |
| Custom coordinates | — | Snap to the nearest grid point (≤500 m) | Kept |
| 3D terrain | — | 5 × 5 km heightmaps, 256 × 256 | Kept |
| Far terrain in 3D | Silhouette ring | Skyline ring from the horizon profile | Kept; a local patch cannot cast 100 km shadows |
| Basemap | — | No streamed tiles | Static LOLA hillshade |
| Curated sites | Chang'e-7, Mons Mouton, Artemis regions | 2024 Artemis regions, 2022 Shackleton sites, CLPS, Apollo 11, 15 and 17, Gazetteer | Merged; 2022 sites kept as illumination benchmarks only |
| Chandrayaan-3 | — | Out of scope | Out of scope |
| Seasons | Missing | Missing | Matrix across a year shows the 1.54° tilt effect |
| Observer height, Earth disk rule | Camera only; disk noted | 2 m for masks | 2 m for masks and camera; Earth center at least 1° above the mask |
| Team and timeline | 4 people, 24 h, gates | 3 streams, 48 h | 4 roles over ~48 h, cut line at H32, submission in the final 6 h |
| Real slip story | Chang'e-7 and Artemis IV | Generic slip | Real story |

`[p 22–23]` (table continues to the end of the document)
