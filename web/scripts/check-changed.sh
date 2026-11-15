#!/bin/sh
# make check-changed: run only the checks the changed files can affect. "Changed" means everything that differs from
# the merge-base with origin/main (commits on this branch plus uncommitted and untracked files); BASE=<ref> overrides it.
# PLAN=1 prints what would run and stops. The full `make check` stays the gate before merging to main and before a deploy.
set -eu
cd "$(git rev-parse --show-toplevel)"
base=${BASE:-$(git merge-base HEAD origin/main)}
files=$({ git diff --name-only "$base"; git ls-files --others --exclude-standard; } | sort -u)
has() { printf '%s\n' "$files" | grep -Eq "$1"; }

py=0; web=0; unit=0; parity=0; e2e=0; room=0; specs=''
has '^build/' && py=1
has '^(build/horizonwalk/|build/scripts/make_parity|shared/fixtures/|web/src/engine/)' && parity=1
has '^web/(src/|tests/e2e/|worker/|[^/]+\.(json|ts|js|html)$)' && web=1
has '^web/(src/|package|vite|vitest|tsconfig)' && unit=1
# UI code and data can change anything on screen, so they run every browser test; the room has its own Worker test
has '^web/(src/|public/data/|tests/e2e/hud\.ts|index\.html|package|vite\.config|playwright\.config)' && e2e=1
has '^web/(worker/(room|index)\.js|src/room\.ts|wrangler|tests/e2e/room\.spec)' && room=1
[ $e2e = 0 ] && specs=$(printf '%s\n' "$files" | grep -E '^web/tests/e2e/.*\.spec\.ts$' | grep -v room.spec | sed 's#^web/##' | tr '\n' ' ' || true)
# unit tests through the import graph, unless config or dependencies changed (then all of them)
unitcmd='npx vitest run --passWithNoTests --changed '"$base"
has '^web/(package|vite|vitest|tsconfig)' && unitcmd='npx vitest run --passWithNoTests'

plan=''
[ $py = 1 ] && plan="$plan python(ruff+pytest)"
[ $web = 1 ] && plan="$plan lint+typecheck"
[ $unit = 1 ] && plan="$plan unit"
[ $parity = 1 ] && plan="$plan parity"
[ $e2e = 1 ] && plan="$plan e2e(all)"
[ -n "$specs" ] && plan="$plan e2e($specs)"
[ $room = 1 ] && plan="$plan e2e-room"
echo "check-changed vs $(git rev-parse --short "$base"): $(printf '%s\n' "$files" | grep -c . || true) changed files"
echo "running:${plan:- nothing (docs or config only)}"
has '^web/worker/(gemini|describe)\.js' && echo "note: the Gemini routes are only exercised by make e2e-live"
[ "${PLAN:-0}" = 1 ] && exit 0

if [ $py = 1 ]; then (cd build && uv run ruff check . && uv run ruff format --check . && uv run pytest -q); fi
if [ $web = 1 ]; then (cd web && npm run lint && npx tsc -b); fi
if [ $unit = 1 ]; then (cd web && $unitcmd); fi
if [ $parity = 1 ]; then make parity; fi
if [ $e2e = 1 ]; then make e2e; elif [ -n "$specs" ]; then (cd web && npx playwright test $specs); fi
if [ $room = 1 ]; then make e2e-room; fi
echo "check-changed: passed"
