# Tranquility Base — one-page summary

**NASA Space Apps 2026 · Lunar Landing Site Navigator** · Live: https://tranquility-base.rohansh2017.workers.dev

![First-person view from the Shackleton rim with the HUD, 19 Nov 2026](../web/tests/screenshots/1-plan-shackleton-rim.png)

## The problem

At the Moon's south pole the Sun never climbs more than about 1.5° above the horizon, so terrain decides whether a landing site is lit, and a few hundred metres or a few days can swing a site from sunny to dark. When a launch slips (Chang'e-7's August 2026 window was called off; Artemis's first crewed landing moved to 2028), planners have to re-check sites and dates fast, across tools that were never meant to be used together.

## What Tranquility Base does

Pick a south-pole site and a landing time. Stand on the real LOLA terrain in 3D and see the Sun and Earth exactly where they will be against the true horizon, with countdowns to sunset and Earthset. Set mission constraints (or type them as a sentence). The finder scans nearby points and later dates, ranks what still works, and explains each option in one line: *"5.0 km S, 12 days later: +97% sun, −158 h dark, +100% comms."* Open any option in 3D next to the original plan.

## How it works

- **Ephemeris:** JPL DE440 + NAIF lunar kernels through Skyfield, hourly 2026–2035, in the LOLA frame (MOON_ME_DE440_ME421). Verified against JPL Horizons: max error 0.0007° at six sites (target 0.1°).
- **Terrain:** LRO LOLA 20 m and 80 m polar DEMs (NASA GSFC PGDA). A 360° horizon mask per grid point, ray-marched to 300 km with lunar curvature; the Sun is a 0.53° disk; Earth counts as visible 1° above the ridge.
- **Checked against the world:** our sunlit % matches PGDA's average-illumination maps at r 0.95–0.99 across nine sites; our slopes match the LOLA slope map to 0.3°.
- **All in the browser:** precomputed files, a Web Worker, prefix sums. 5,000 candidates × 60 days in under a second.
- **On Cloudflare:** Workers serve the app, R2 serves the data by region, a Durable Object keeps a mission room of browsers in step. Gemini turns a typed requirement into schema-validated constraint JSON; every number still comes from our engine.

## Objectives covered

| Challenge objective | In the app |
| --- | --- |
| Site selection and comparison | 9 curated south-pole sites, custom coordinates and map clicks, finder, matrix, side-by-side, nudge |
| Date and time flexibility | UTC picker, lunar-day scrubber, slip-range search, year-long matrix |
| Sun and Earth visualization | 3D sky against the true horizon, panorama, HUD countdowns |
| Power and comms assessment | Sunlit %, longest dark run, Earth visibility, power index, pass/fail per constraint |
| Multiple visualizations | 3D, panorama, scenario matrix, illumination map |
| Temporal dynamics | Scrubber, playback with trails, tracks across the window |
| Accessibility | Planner and Explorer modes, plain-language results, guided tour, share links, sentence entry |

## Limits

Screening grade: a 500 m search grid, 20 m terrain within 10 km and 80 m beyond. Not a mission design, hazard, power, thermal or link-budget tool. Ground detail finer than 20 m in the 3D view is illustrative and labelled so.

**Data:** NASA/JPL DE440 and NAIF kernels · LRO LOLA via NASA GSFC PGDA · JPL Horizons and PGDA illumination maps for validation · site coordinates from NASA Artemis III and CLPS releases and PGDA · Explorer text in our own words from NASA and CSA Moon Exploration material.
