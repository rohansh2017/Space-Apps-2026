#!/bin/sh
# make perf: finder timing at the spec's size and the size of what the browser downloads.
# Run from web/ after `npm run build`. Prints Markdown (the Makefile writes it to docs/PERF.md).
set -eu
mb() { cat "$@" | wc -c | awk '{printf "%.2f MB", $1 / 1e6}'; }
d=dist/data

echo "# Performance"
echo
echo "Measured values only. Regenerate with \`make perf\`. Machine: $(uname -srm), node $(node -v) ($(node -p process.arch))."
echo
echo "## Finder (target: 5,000 candidates x 60-day slip range under 3 s)"
echo
npx vitest run src/engine/finder.perf --reporter=verbose --disableConsoleIntercept 2>&1 | grep PERF | sed 's/^PERF /- /'
echo
echo "The end-to-end test also asserts the real demo search finishes in under 3 s in the browser."
echo
echo "## 3D frame rate (target: 30 fps or more on a typical laptop)"
echo
GPU=1 npx playwright test p3 -g "playback|orbiting the pole" 2>&1 | grep PERF | sed 's/^PERF /- /'
echo
echo "Measured during lunar-day playback (shadows on) and while orbiting the Moon view's pole (frame start to GPU done), in Chromium on this machine's GPU. The empty-page figure is the browser's own ceiling on this run (display refresh, power state); the 3D figure cannot exceed it."
echo
echo "## Initial load (target: under 10 MB for the demo regions)"
echo
echo "- App bundle (HTML + JS + CSS): $(mb dist/index.html dist/assets/*)"
echo "- Data fetched at start for the Moon view (sites, points, schema, tour, polar basemap, polar relief (D67), ephemeris 2026-2035): $(mb $d/sites.json $d/points.json $d/constraints.schema.json $d/tour.json $d/basemap.json $d/basemaps/pole.png $d/basemaps/relief/pole.png $d/ephemeris.json $d/ephemeris/* $d/stars.json)"
echo "- Terrain detail streamed after the first view is drawn (the 75S cap and whole-Moon relief, D71): $(mb $d/basemaps/relief/cap.png $d/basemaps/relief/globe.png)"
echo "- Star field, after the first frame (stars and one year of orientation, D61): $(mb $d/stars.bin $d/orientation/2026.bin)"
echo "- Flying down to one site (masks + slopes + ridges + region map + its context relief, D67): $(mb $d/masks/change7-shackleton-rim.bin $d/slopes/change7-shackleton-rim.bin $d/ridges/change7-shackleton-rim.bin $d/basemaps/change7-shackleton-rim.png $d/basemaps/relief/context/change7-shackleton-rim.png)"
echo "- Zooming within about 8 km of it, or standing in 3D (its 5 m heightmap): $(mb $d/heightmaps/change7-shackleton-rim.png)"
echo "- All nine regions' masks and slopes (fetched when the finder or the matrix runs): $(mb $d/masks/* $d/slopes/*)"
