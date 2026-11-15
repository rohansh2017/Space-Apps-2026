# 🔗 Traceability

Every requirement → where it is built → how it is tested. **31 done · 2 partial · 5 to do**
(of 38).

- **Status:** `done` needs a passing test or a recorded check; notes in brackets say what differs from the spec.
- **Priority:** M = must · S = should · C = could · Prize = sponsor prize.
- **Objective(s):** the challenge objectives in [spec/SPEC.md](spec/SPEC.md).

| ID | Requirement (short) | Priority | Objective(s) | Implemented in | Tested by | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Curated site list + custom lat/lon + map click, snapped to grid | M | 1 | web/src/App.tsx (locate, pickOnMoon), MoonView.tsx (pins, grid clicks; the Map drawer was removed, D61), engine.ts snapToGrid | e2e p3.spec.ts (custom coordinates, pin click), moon.spec.ts (grid click, drag, outside), metrics.test.ts | done (9 polar sites; Apollo 11/15/17 removed from the app, kept in validation, D44) |
| F2 | UTC date/time picker + lunar-day scrubber, 2026–2035 | M | 2, 6 | web/src/App.tsx | e2e demo.spec.ts | done (windows past 2035 are reported, not computed) |
| F3 | First-person 3D scene: Sun/Earth at true az/el, shadows, silhouette ring | M | 3, 5 | web/src/Scene3D.tsx, starfield.ts, regolith.ts | e2e demo.spec.ts, orientation.test.ts, screenshots 1–5 | done (5 m LOLA relief at 8 of 9 sites, real BSC5 stars; illustrative parts listed in the footer, D37–D40; distant ranges lit from LOLA crest slopes, D45) |
| F4 | HUD: elevations, lit/link status, power index, countdowns | M | 3, 4 | web/src/Hud.tsx | e2e demo.spec.ts (HUD = engine at four steps) | done (horizon height toward Sun and Earth shown, D47) |
| F5 | Horizon panorama with Sun and Earth tracks | M | 3, 5, 6 | web/src/Panorama.tsx | e2e demo.spec.ts | done (window = one lunar day from landing) |
| F6 | Constraint panel with presets | M | 4 | web/src/ConstraintPanel.tsx, presets.ts | e2e demo.spec.ts | done |
| F7 | Constraint finder: ranked dates and nearby sites, pass/fail per constraint | M | 1, 2, 4 | web/src/engine/finder.ts, finder.worker.ts, Results.tsx | finder.test.ts, e2e demo.spec.ts | done (forward-only, D19) |
| F8 | Plain-language difference from the original plan | M | 4, 7 | web/src/engine/finder.ts diffText | finder.test.ts, e2e demo.spec.ts | done (rows titled by difference, D47) |
| F9 | Planner and Explorer modes | M | 7 | web/src/App.tsx, Summary.tsx, Hud.tsx, Glossary.tsx | e2e p3.spec.ts (Explorer mode) | done |
| F10 | Scenario matrix | S | 1, 2, 5 | web/src/Matrix.tsx | e2e p3.spec.ts (scenario matrix) | done |
| F11 | Side-by-side comparison | S | 1, 5 | web/src/Tray.tsx (compare tray), App.tsx planDay/pinnedDays | e2e p4.spec.ts (F11) | done (plan + up to 3 pinned scenarios as a table, shared scrubber, adopt a pin as the plan, D27, D49, D50); snapshot pins, reorder by drag or Alt+arrows (D59) |
| F12 | Lunar-day playback with trails | S | 6 | web/src/App.tsx (playback), Scene3D.tsx, Panorama.tsx | e2e p3.spec.ts (playback) | done |
| F13 | Guided tour from tour.json | S | 7 | web/src/Tour.tsx, build/tour_src.json | e2e p4.spec.ts (F13) | done (outsider test of the tour still pending) |
| F14 | Nudge control (100 m / 1 day) | S | 1, 2, 7 | web/src/App.tsx nudge, engine.ts nudgeNeighbour, Summary.tsx deltas | metrics.test.ts, e2e p4.spec.ts (F14) | done (500 m grid step, not 100 m: D26) |
| F15 | Top-down illumination map | S | 5 | web/src/MoonView.tsx (Sunlight layer: filled 500 m cells at a site, tinted pins at the pole, D61), moon.ts gridStats, ramp.ts | e2e p4.spec.ts (F15) | done (sunlit % over the mission window, per 500 m cell, draped on the terrain; straight down by orbiting) |
| F16 | Slope screening (numpy.gradient, checked vs LOLA slope map) | S | 1 | build/scripts/build_data.py slopes, finder max_slope_deg, build/scripts/validate_slopes.py | finder.test.ts (steep candidate fails), make validate (slopes section) | done (r ≥ 0.994, mean abs diff ≤ 0.33° at nine sites) |
| F17 | Shareable URL | S | 7 | web/src/share.ts, App.tsx | share.test.ts, e2e p4.spec.ts (F17) | done |
| F18 | Solar array presets for the power index | C | 4 |  |  | todo |
| F19 | Export scenario summary (CSV/PDF) | C | 7 |  |  | todo |
| F20 | Lunar Night Survivor game mode | C | 7 |  |  | todo |
| F21 | Gemini sentence → schema-validated constraint JSON | S | 7 | web/worker/gemini.js, web/src/gemini.ts, SentenceEntry.tsx | gemini.test.ts, e2e p4.spec.ts (mocked route), gemini.spec.ts (live, make e2e-live) | done |
| F22 | Gemini horizon description with template fallback | C | 7 | web/worker/describe.js, web/src/describe.ts, HorizonText.tsx | describe.test.ts, e2e p4.spec.ts (mocked: kept / rejected), gemini.spec.ts (live) | done |
| F23 | Deploy on Cloudflare: Workers static assets + R2 by region | M | Prize | web/wrangler.jsonc, web/worker/index.js, web/scripts/upload-data.sh | make e2e-live (15 browser tests on the live URL; `x-data-source: r2`) | done |
| F24 | Mission room (Durable Object, WebSockets) | S | Prize | web/worker/room.js (MissionRoom), worker/index.js /room/{id}, web/src/room.ts, App.tsx | e2e room.spec.ts (make e2e-room, make e2e-live) | done |
| F26 | Gemini slip copilot: a slip scenario → constraints, later landing and site, confirmed, then the finder runs (one call) | C | 2, 7 | web/worker/copilot.js, worker/gemini-call.js, web/src/copilot.ts, SentenceEntry.tsx, App.tsx applyCopilot, Results.tsx | copilot.test.ts, e2e p4.spec.ts (mocked), gemini.spec.ts (live) | done (D63) |
| F28 | First-visit quick tour: four real actions, each step advancing when the app's state shows it was done (about 30 s) | C | 7 | web/src/onboarding.ts, Coach.tsx, App.tsx (snapshot, auto-open, Quick tour button), data-tour attributes in App.tsx and MoonView.tsx | onboarding.test.ts, e2e onboarding.spec.ts | done (D65) |
| F27 | "Why not?": per failing constraint the value that passes, and the plan's earliest passing hour; optional Gemini rewording | C | 2, 7 | web/src/engine/finder.ts (relaxations, planPassStart), whynot.ts, WhyNotLine.tsx, Results.tsx, web/worker/whynot.js | finder.test.ts, whynot.test.ts, e2e p4.spec.ts (mocked), gemini.spec.ts (live) | done (D63) |
| F25 | Moon view: every site at a glance, fly down to a site's grid, drag the landing point | S | 1, 5 | web/src/MoonView.tsx, moon.ts, App.tsx (stageView, gridStats, loadSitePoint), Tray.tsx, worker/index.js (Range) | moon.test.ts, e2e moon.spec.ts | done (D58; whole-Moon relief and 5 m site layer, D60; stars, Pole button, heat cells, D61; 20 m context maps, D62; 3D relief, real-Sun lighting and shadows, D67; Topo layer, D68) |
| SM1 | Every M item works end to end in the deployed build | M | - | live URL | make e2e-live (demo path F1–F9 on the deployed build) | done |
| SM2 | Engine within 0.1° of Horizons (az and el) at the validation sites | M | - | build/horizonwalk/engine.py, ephem.py | make validate | done (6 sites, 720 h, max error 0.0007°) |
| SM3 | Finder under 3 s for 5,000 candidates × 60-day slip | M | - | web/src/engine/finder.ts | make perf (finder.perf.test.ts) | done (966 ms) |
| SM4 | 3D view holds 30 fps on a typical laptop | M | - | web/src/Scene3D.tsx | make perf | partial (60 fps on an M1 Pro and an M5; no non-Apple laptop measured) |
| SM5 | Three outsiders can explain why a small move costs days of sunlight | M | - |  |  | todo |
| SM6 | Demo runs under 3 minutes twice in a row | M | - |  |  | todo |
| SM7 | If built: two browsers stay in step; a typed sentence fills the panel with schema-valid values | S | - | web/worker/room.js | e2e room.spec.ts | done (room.spec.ts; gemini.spec.ts live: the demo sentence fills the panel with 96 h / 50 %) |
| PT1 | 3D frame rate ≥ 30 fps | M | - | web/src/Scene3D.tsx | make perf | partial (60 fps on an M1 Pro and an M5) |
| PT2 | Finder: 5,000 candidates × 60-day slip under 3 s | M | - | web/src/engine/finder.ts | make perf | done (0.85–0.97 s) |
| PT3 | Initial load for the demo regions under 10 MB | M | - | web/tests/perf.sh | make perf | done (9.45 MB for the first view and one fly-down: 1.45 MB app + 6.36 MB at start incl. the polar and whole-Moon relief + 0.32 MB stars + 1.32 MB site incl. its context relief, D67; zooming close or standing in 3D adds the 1.94 MB heightmap; 9.71 MB before the relief replaced the whole-Moon and context hillshades) |
