"""Per-site context hillshades for the Moon view (D62): the 20 m polar DEM, +-32 km around each
terrain site, block-averaged and shaded like the region maps -> basemaps/context/{site}.jpg.

Needs only data/raw/LDEM_80S_20MPP_ADJ.TIF (`make data-download`); reads one window per site, so the
2.6 GB file is never loaded whole. Writes the JPEGs and the `context` entry of basemap.json.
"""

import json
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from horizonwalk import export
from horizonwalk.geo import latlon_to_xy

ROOT = Path(__file__).resolve().parents[2]
RAW, OUT = ROOT / "data" / "raw", ROOT / "web" / "public" / "data"
BLOCK = (
    int(sys.argv[1]) if len(sys.argv) > 1 else 1
)  # 20 m pixels averaged per side (1 = full 20 m; 2 -> 40 m)


def main() -> None:
    t0 = time.time()
    sites = json.loads((OUT / "sites.json").read_text())["sites"]
    half = export.CONTEXT_HALF_M
    maps = {}
    with rasterio.open(RAW / "LDEM_80S_20MPP_ADJ.TIF") as dem:
        res = dem.res[0]
        for s in sites:
            if not s["terrain"]:
                continue
            cx, cy = (float(v) for v in latlon_to_xy(s["lat"], s["lon"]))
            win = from_bounds(cx - half, cy - half, cx + half, cy + half, dem.transform)
            near = dem.read(1, window=win.round_offsets().round_lengths()).astype(np.float64)
            n = near.shape[0] // BLOCK * BLOCK
            near = near[:n, :n].reshape(n // BLOCK, BLOCK, n // BLOCK, BLOCK).mean(axis=(1, 3))
            assert np.isfinite(near).all(), s["id"]
            maps[s["id"]] = export.hillshade(near, res * BLOCK)
    export.write_context(
        OUT, maps, res * BLOCK, "LOLA 20 m polar DEM (LDEM_80S_20MPP_ADJ)", synthetic=False
    )
    for sid in maps:
        f = OUT / "basemaps" / "context" / f"{sid}.jpg"
        print(
            f"{sid}: {maps[sid].shape[0]} px at {res * BLOCK:.0f} m, {f.stat().st_size / 1e6:.2f} MB"
        )
    print(f"context maps written ({time.time() - t0:.0f} s)")


if __name__ == "__main__":
    main()
