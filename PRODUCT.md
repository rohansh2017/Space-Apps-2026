# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary users: lunar mission planning teams (planners, engineers, science team members) whose
landing plan has just been disturbed: a launch slips, a constraint tightens, a site is questioned.
Their job is to compare candidate sites and landing dates side by side and settle on a viable
alternative quickly, without hopping between specialist tools or reading raw data.

How the product is evaluated: NASA Space Apps 2026 judges watching a 3-minute live demo (Lunar
Landing Site Navigator challenge). The demo is the proof that the planner's comparison job works, so
it must land in three minutes, but design decisions serve the planner's comparison job first.

The demo story: China called off Chang'e-7's August 2026 launch to the Shackleton rim; the planner
sees the site lose sunlight at a later date, runs the finder, compares the alternatives and walks the
best one in 3D.

Secondary audience: educators, students and the public ("why is the south pole so hard?") through
Explorer mode.

## Product Purpose

Rapid, intuitive comparison of multiple landing scenarios (site × landing time), so a team finds
viable alternatives fast when constraints shift.

At the lunar south pole the Sun stays within about 1.5° of the horizon and Earth sits low, so terrain
decides power and communication: a move of a few hundred metres or a slip of a few days can swing a
site from sunny to dark and from linked to cut off, and the pattern changes across lunar days and
seasons. Today, evaluating each site-and-date combination means navigating multiple interfaces and
interpreting raw ephemeris and topographic data. Tranquility Base bridges that gap: it turns JPL
ephemeris and LRO LOLA terrain into clear, comparable visualizations (first-person 3D view, horizon
panorama, metrics, pass/fail per constraint, scenario matrix) and a finder that ranks alternatives
and explains each in one plain-English line, e.g. "5.0 km S, 12 days later: +97% sun, −158 h dark,
+100% comms".

Success: in under a minute anyone sees what a site is like and whether it meets mission needs; in
under five minutes a planner has compared the options and found a replacement when the plan changes.

## Positioning

The data exists in Horizons, Quickmap and Moon Trek, but checking one site and date means hopping
between specialist tools, and a slip means checking many. Tranquility Base puts every scenario on one
screen in comparable form and answers "what now?", on real data validated against those sources
(Horizons max error 0.0007°, PGDA illumination r 0.95–0.99, LOLA slopes to 0.3°), entirely in the
browser.

## Operating Context

- Planning-team use on laptops and shared screens; share links reopen a plan, and a mission room keeps
  teammates' browsers in step while they compare.
- Evaluation: a live demo on a projector or laptop, plus a one-page handout and a recorded backup
  video.
- Full-screen mode is required, in both senses: the interface fills the browser window with no page
  scroll, and a true full-screen toggle (browser Fullscreen API) is available for projector demos.
- Two modes in one interface: Planner (exact numbers) and Explorer (plain-English labels, glossary
  tooltips, guided tour).
- Public static site on Cloudflare Workers.

## Capabilities and Constraints

- Surfaces: first-person 3D view, HUD, 360° horizon panorama, constraint panel with presets,
  finder results, side-by-side comparison, nudge, scenario matrix, region/pole maps, scrubber and
  playback, tour, sentence entry (Gemini), horizon description (Gemini), mission room.
- Comparison today: the plan beside one opened alternative (side-by-side), and the scenario matrix
  across all sites and dates. Open decision: how many scenarios a user can compare at once, and how
  they are gathered; the redesign (`shape`) proposes it.
- 9 curated south-pole sites (80–90°S) plus custom coordinates snapped to a 500 m grid; 2026–2035.
- Every number on screen comes from the engine, never the renderer. Gemini only turns text into
  validated constraint JSON or describes engine facts, labelled as generated, with fallbacks.
- Decoration that is not data (sub-1.5 m soil texture, ring rock texture, ground colour, Sun glare,
  Earth's surface, star colours) must stay labelled and below the DEM's resolution.
- Not a mission design, hazard, power/thermal or link-budget tool; screening grade only. The
  screening-grade statement and the non-goals must stay visible in the app.
- No runtime network calls apart from the Gemini routes and the mission room (fonts and assets are
  bundled).
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

1. Compare, don't hop: every scenario a planner considers can be seen next to the others in the same
   form, on one screen.
2. Truth first: real data, labelled decoration, no number from the renderer, synthetic never shown as
   real.
3. Answer "what now?": every result is a ranked, explained alternative, not a raw table.
4. The story in one minute: a judge must grasp "terrain decides the light" and "a slip has answers" fast.
5. One interface, two depths: Planner precision and Explorer plain language share the same view.

## Accessibility & Inclusion

No formal standard. The bar is the challenge's accessibility objective: Planner/Explorer modes,
plain-language results, glossary, guided tour, share links and sentence entry.
