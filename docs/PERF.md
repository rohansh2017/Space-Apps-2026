# Performance

Measured values only. Regenerate with `make perf`. Machine: Darwin 25.6.0 arm64, node v22.22.0 (x64).

## Finder (target: 5,000 candidates x 60-day slip range under 3 s)

- finder: 5000 candidates, 305378 (candidate, start) pairs, 895 ms

The end-to-end test also asserts the real demo search finishes in under 3 s in the browser.

## 3D frame rate (target: 30 fps or more on a typical laptop)

- 3D playback: 60 fps over 4 s at 1200 x 1000 (ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version))

Measured during lunar-day playback (shadows on) in Chromium on this machine's GPU.

## Initial load (target: under 10 MB for the demo regions)

- App bundle (HTML + JS + CSS): 1.23 MB
- Data fetched at start (sites, points, schema, tour, polar basemap, ephemeris and orientation 2026-2035, stars): 5.49 MB
- One region, fetched on demand (masks + slopes + heightmap + basemap): 2.47 MB
- All nine regions' masks and slopes (fetched when the finder or the matrix runs): 2.86 MB
