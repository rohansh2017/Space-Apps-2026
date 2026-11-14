# Performance

Measured values only. Regenerate with `make perf`. Machine: Darwin 25.6.0 arm64, node v22.22.0 (x64).

## Finder (target: 5,000 candidates x 60-day slip range under 3 s)

- finder: 5000 candidates, 305378 (candidate, start) pairs, 854 ms

The end-to-end test also asserts the real demo search finishes in under 3 s in the browser.

## Initial load (target: under 10 MB for the demo regions)

- App bundle (HTML + JS + CSS): 1.18 MB
- Data fetched at start (sites, points, schema, ephemeris 2026-2035): 3.36 MB
- One region, fetched on demand (masks + slopes + heightmap): 0.44 MB
- All nine regions' masks and slopes (fetched when the finder runs): 2.86 MB
