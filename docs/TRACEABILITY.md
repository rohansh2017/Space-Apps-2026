# Traceability

Status: todo / partial / done. `done` needs a passing test or a recorded check.

| ID | Requirement (short) | Priority | Objective(s) | Implemented in | Tested by | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Curated site list + custom lat/lon + map click, snapped to grid | M | 1 | web/src/App.tsx (locate), SiteMap.tsx, engine.ts snapToGrid | e2e p3.spec.ts (custom coordinates), metrics.test.ts | done |
| F2 | UTC date/time picker + lunar-day scrubber, 2026–2035 | M | 2, 6 | web/src/App.tsx | e2e demo.spec.ts | done (windows past 2035 are reported, not computed) |
| F3 | First-person 3D scene: Sun/Earth at true az/el, shadows, silhouette ring | M | 3, 5 | web/src/Scene3D.tsx, regolith.ts | e2e demo.spec.ts, screenshots 1–5 | done (surface detail below 20 m is illustrative, D22) |
| F4 | HUD: elevations, lit/link status, power index, countdowns | M | 3, 4 | web/src/Hud.tsx | e2e demo.spec.ts (HUD = engine at four steps) | done |
| F5 | Horizon panorama with Sun and Earth tracks | M | 3, 5, 6 | web/src/Panorama.tsx | e2e demo.spec.ts | done (window = one lunar day from landing) |
| F6 | Constraint panel with presets | M | 4 | web/src/ConstraintPanel.tsx, presets.ts | e2e demo.spec.ts | done |
| F7 | Constraint finder: ranked dates and nearby sites, pass/fail per constraint | M | 1, 2, 4 | web/src/engine/finder.ts, finder.worker.ts, Results.tsx | finder.test.ts, e2e demo.spec.ts | done (forward-only, D19) |
| F8 | Plain-language difference from the original plan | M | 4, 7 | web/src/engine/finder.ts diffText | finder.test.ts, e2e demo.spec.ts | done |
| F9 | Planner and Explorer modes | M | 7 | web/src/App.tsx, Summary.tsx, Hud.tsx, Glossary.tsx | e2e p3.spec.ts (Explorer mode) | done |
| F10 | Scenario matrix | S | 1, 2, 5 | web/src/Matrix.tsx | e2e p3.spec.ts (scenario matrix) | done |
| F11 | Side-by-side comparison | S | 1, 5 | web/src/Compare.tsx, App.tsx planDay | e2e p4.spec.ts (F11) | done (paired panoramas + metrics, D27) |
| F12 | Lunar-day playback with trails | S | 6 | web/src/App.tsx (playback), Scene3D.tsx, Panorama.tsx | e2e p3.spec.ts (playback) | done |
| F13 | Guided tour from tour.json | S | 7 | web/src/Tour.tsx, build/tour_src.json | e2e p4.spec.ts (F13) | done (outsider test of the tour still pending) |
| F14 | Nudge control (100 m / 1 day) | S | 1, 2, 7 | web/src/App.tsx nudge, engine.ts nudgeNeighbour, Summary.tsx deltas | metrics.test.ts, e2e p4.spec.ts (F14) | done (500 m grid step, not 100 m: D26) |
| F15 | Top-down illumination map | S | 5 |  |  | todo |
| F16 | Slope screening (numpy.gradient, checked vs LOLA slope map) | S | 1 |  |  | todo |
| F17 | Shareable URL | S | 7 |  |  | todo |
| F18 | Solar array presets for the power index | C | 4 |  |  | todo |
| F19 | Export scenario summary (CSV/PDF) | C | 7 |  |  | todo |
| F20 | Lunar Night Survivor game mode | C | 7 |  |  | todo |
| F21 | Gemini sentence → schema-validated constraint JSON | S | 7 |  |  | todo |
| F22 | Gemini horizon description with template fallback | C | 7 |  |  | todo |
| F23 | Deploy on Cloudflare: Workers static assets + R2 by region | M | Prize | web/wrangler.jsonc, web/worker/index.js, web/scripts/upload-data.sh | make e2e-live (5 browser tests on the live URL; `x-data-source: r2`) | done |
| F24 | Mission room (Durable Object, WebSockets) | S | Prize |  |  | todo |
| SM1 | Every M item works end to end in the deployed build | M | - | live URL | make e2e-live (demo path F1–F9 on the deployed build) | done |
| SM2 | Engine within 0.1° of Horizons (az and el) at the validation sites | M | - | build/horizonwalk/engine.py, ephem.py | make validate | done (6 sites, 720 h, max error 0.0007°) |
| SM3 | Finder under 3 s for 5,000 candidates × 60-day slip | M | - | web/src/engine/finder.ts | make perf (finder.perf.test.ts) | done (966 ms) |
| SM4 | 3D view holds 30 fps on a typical laptop | M | - | web/src/Scene3D.tsx | make perf | partial (60 fps on an M1 Pro; no other laptop measured) |
| SM5 | Three outsiders can explain why a small move costs days of sunlight | M | - |  |  | todo |
| SM6 | Demo runs under 3 minutes twice in a row | M | - |  |  | todo |
| SM7 | If built: two browsers stay in step; a typed sentence fills the panel with schema-valid values | S | - |  |  | todo |
| PT1 | 3D frame rate ≥ 30 fps | M | - | web/src/Scene3D.tsx | make perf | partial (60 fps on an M1 Pro) |
| PT2 | Finder: 5,000 candidates × 60-day slip under 3 s | M | - | web/src/engine/finder.ts | make perf | done (966 ms) |
| PT3 | Initial load for the demo regions under 10 MB | M | - | web/tests/perf.sh | make perf | done (5.1 MB at start, 0.65 MB per region) |
