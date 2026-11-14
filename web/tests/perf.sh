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
echo "## Initial load (target: under 10 MB for the demo regions)"
echo
echo "- App bundle (HTML + JS + CSS): $(mb dist/index.html dist/assets/*)"
echo "- Data fetched at start (sites, points, schema, ephemeris 2026-2035): $(mb $d/sites.json $d/points.json $d/constraints.schema.json $d/ephemeris.json $d/ephemeris/*)"
echo "- One region, fetched on demand (masks + slopes + heightmap): $(mb $d/masks/change7-shackleton-rim.bin $d/slopes/change7-shackleton-rim.bin $d/heightmaps/change7-shackleton-rim.png)"
echo "- All nine regions' masks and slopes (fetched when the finder runs): $(mb $d/masks/* $d/slopes/*)"
