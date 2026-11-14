# Traceability

Status: todo / partial / done. `done` needs a passing test or a recorded check.

| ID | Requirement (short) | Priority | Objective(s) | Implemented in | Tested by | Status |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Curated site list + custom lat/lon + map click, snapped to grid | M | 1 |  |  | todo |
| F2 | UTC date/time picker + lunar-day scrubber, 2026–2035 | M | 2, 6 |  |  | todo |
| F3 | First-person 3D scene: Sun/Earth at true az/el, shadows, silhouette ring | M | 3, 5 |  |  | todo |
| F4 | HUD: elevations, lit/link status, power index, countdowns | M | 3, 4 |  |  | todo |
| F5 | Horizon panorama with Sun and Earth tracks | M | 3, 5, 6 |  |  | todo |
| F6 | Constraint panel with presets | M | 4 |  |  | todo |
| F7 | Constraint finder: ranked dates and nearby sites, pass/fail per constraint | M | 1, 2, 4 |  |  | todo |
| F8 | Plain-language difference from the original plan | M | 4, 7 |  |  | todo |
| F9 | Planner and Explorer modes | M | 7 |  |  | todo |
| F10 | Scenario matrix | S | 1, 2, 5 |  |  | todo |
| F11 | Side-by-side comparison | S | 1, 5 |  |  | todo |
| F12 | Lunar-day playback with trails | S | 6 |  |  | todo |
| F13 | Guided tour from tour.json | S | 7 |  |  | todo |
| F14 | Nudge control (100 m / 1 day) | S | 1, 2, 7 |  |  | todo |
| F15 | Top-down illumination map | S | 5 |  |  | todo |
| F16 | Slope screening (numpy.gradient, checked vs LOLA slope map) | S | 1 |  |  | todo |
| F17 | Shareable URL | S | 7 |  |  | todo |
| F18 | Solar array presets for the power index | C | 4 |  |  | todo |
| F19 | Export scenario summary (CSV/PDF) | C | 7 |  |  | todo |
| F20 | Lunar Night Survivor game mode | C | 7 |  |  | todo |
| F21 | Gemini sentence → schema-validated constraint JSON | S | 7 |  |  | todo |
| F22 | Gemini horizon description with template fallback | C | 7 |  |  | todo |
| F23 | Deploy on Cloudflare: Workers static assets + R2 by region | M | Prize | web/wrangler.jsonc | manual: URL returns 200 | partial (empty app live; R2 blocked) |
| F24 | Mission room (Durable Object, WebSockets) | S | Prize |  |  | todo |
| SM1 | Every M item works end to end in the deployed build | M | - |  |  | todo |
| SM2 | Engine within 0.1° of Horizons (az and el) at the validation sites | M | - | build/horizonwalk/ephem.py, geo.py | make validate | partial (1 of 6 sites, 24 h) |
| SM3 | Finder under 3 s for 5,000 candidates × 60-day slip | M | - |  |  | todo |
| SM4 | 3D view holds 30 fps on a typical laptop | M | - |  |  | todo |
| SM5 | Three outsiders can explain why a small move costs days of sunlight | M | - |  |  | todo |
| SM6 | Demo runs under 3 minutes twice in a row | M | - |  |  | todo |
| SM7 | If built: two browsers stay in step; a typed sentence fills the panel with schema-valid values | S | - |  |  | todo |
| PT1 | 3D frame rate ≥ 30 fps | M | - |  |  | todo |
| PT2 | Finder: 5,000 candidates × 60-day slip under 3 s | M | - |  |  | todo |
| PT3 | Initial load for the demo regions under 10 MB | M | - |  |  | todo |
