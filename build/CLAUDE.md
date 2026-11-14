# build/ conventions

- Python >= 3.11 managed by `uv` (`uv sync`, `uv run ...`). Type hints; `ruff` for lint and format.
- Package `horizonwalk`: `ephem.py` (Skyfield directions), `geo.py` (site frame, stereographic).
  Later phases add dem, masks, engine, heightmaps, slopes, export.
- Everything is in MOON_ME_DE440_ME421. Longitudes are east-positive.
- Raw inputs live in `data/raw/` (gitignored). Horizons responses are cached in `build/cache/` and committed.
- `sites_src.json` is the hand-authored site list (one source per site). Generated `sites.json` adds heightmap fields.
- `numba<0.62` is pinned: newer llvmlite has no wheel for Intel macOS.
- Skyfield gotcha: `moon_pa_de440_200625.bpc` has two segments and Skyfield keeps only the last;
  `ephem._kernels` selects the one covering 2026-2035.
