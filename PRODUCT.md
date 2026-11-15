# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary audience: NASA Space Apps 2026 judges watching a 3-minute live demo (Lunar Landing Site
Navigator challenge). The first impression and the demo story outrank daily-use efficiency.

The story the demo tells is a mission planner's job: China called off Chang'e-7's August 2026 launch
to the Shackleton rim; the planner sees the site lose sunlight at a later date, runs the finder, and
walks the best alternative in 3D. Secondary users from the spec: mission planners/engineers ("our
date slipped, what still works?"), science team members ("when is the target lit?"), and educators,
students and the public ("why is the south pole so hard?") through Explorer mode.

## Product Purpose

Pick a lunar south-pole site and landing time, stand on real LRO LOLA terrain in 3D, and see the Sun
and Earth exactly where they will be against the true horizon, with countdowns to sunset and
Earthset. Set mission constraints (fields or a sentence); when a launch slips, the finder ranks nearby
points and later dates that still work and explains each in one plain-English line, e.g.
"5.0 km S, 12 days later: +97% sun, −158 h dark, +100% comms".

Vision: in under a minute anyone sees what a site is like and whether it meets mission needs; in
under five minutes a planner finds a replacement when the plan changes.

## Positioning

The data exists in Horizons, Quickmap and Moon Trek, but checking one site and date means hopping
between specialist tools, and a slip means checking many. Tranquility Base puts the check in one
place and answers "what now?", on real data validated against those sources (Horizons max error
0.0007°, PGDA illumination r 0.95–0.99, LOLA slopes to 0.3°), entirely in the browser.

## Operating Context

- Live demo on a projector/laptop, plus a one-page handout and recorded backup video.
- Public static site on Cloudflare Workers; share links reopen a plan; a mission room keeps
  teammates' browsers in step.
- Two modes in one interface: Planner (exact numbers) and Explorer (plain-English labels, glossary
  tooltips, guided tour).

## Capabilities and Constraints

- Surfaces: first-person 3D view, HUD, 360° horizon panorama, constraint panel with presets,
  finder results, side-by-side comparison, nudge, scenario matrix, region/pole maps, scrubber and
  playback, tour, sentence entry (Gemini), horizon description (Gemini), mission room.
- 9 curated south-pole sites (80–90°S) plus custom coordinates snapped to a 500 m grid; 2026–2035.
- Every number on screen comes from the engine, never the renderer. Gemini only turns text into
  validated constraint JSON or describes engine facts, labelled as generated, with fallbacks.
- Decoration that is not data (sub-1.5 m soil texture, ring rock texture, ground colour, Sun glare,
  Earth's surface, star colours) must stay labelled and below the DEM's resolution.
- Not a mission design, hazard, power/thermal or link-budget tool; screening grade only.
- Stack fixed by the codebase: React + TypeScript + Vite, react-three-fiber, Cloudflare Workers/R2/
  Durable Objects.

## Brand Commitments

Only the name "Tranquility Base" is fixed. No logo, colour or typeface is committed; the visual
identity is open for the redesign.

## Evidence on Hand

- Real validation numbers: `docs/VALIDATION.md`, `docs/PERF.md`.
- Data credits: NASA/JPL DE440 and NAIF kernels, LRO LOLA via NASA GSFC PGDA, BSC5 stars, site
  coordinates from NASA Artemis III and CLPS releases and PGDA.
- Screenshots: `web/tests/screenshots/`. Demo script: `docs/DEMO_SCRIPT.md`.
- No testimonials, users, or endorsements exist; never invent them or imply NASA endorsement.

## Product Principles

1. Truth first: real data, labelled decoration, no number from the renderer, synthetic never shown as real.
2. The story in one minute: a judge must grasp "terrain decides the light" and "a slip has answers" fast.
3. Answer "what now?": every result is a ranked, explained alternative, not a raw table.
4. One interface, two depths: Planner precision and Explorer plain language share the same view.

## Accessibility & Inclusion

No formal standard. The bar is the challenge's accessibility objective: Planner/Explorer modes,
plain-language results, glossary, guided tour, share links and sentence entry.
