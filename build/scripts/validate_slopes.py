"""Our numpy.gradient slopes (slopes/{region}.bin) vs the LOLA slope map LDSM_80S_20MPP_ADJ.TIF (F16).

Prints Markdown, appended to docs/VALIDATION.md by `make validate`. Needs data/raw/LDSM_80S_20MPP_ADJ.TIF.
Ours is numpy.gradient on the 20 m DEM, sampled bilinearly at the grid points and rounded to whole
degrees (Uint8). The LOLA product is a slope map on the same 20 m grid; it is sampled the same way.
"""

import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from horizonwalk.masks import sample

ROOT = Path(__file__).resolve().parents[2]
RAW, DATA = ROOT / "data" / "raw", ROOT / "web" / "public" / "data"
MIN_R, MAX_MEAN_ABS_DEG = 0.9, 1.0


def main() -> int:
    points = json.loads((DATA / "points.json").read_text())["points"]
    sites = {s["id"]: s for s in json.loads((DATA / "sites.json").read_text())["sites"]}
    print("\n## Slopes vs the LOLA slope map (LDSM_80S_20MPP_ADJ)\n")
    print("Ours: numpy.gradient on the 20 m DEM at each grid point, stored as whole degrees. LOLA: "
          "the PGDA slope product sampled at the same points. Pass: Pearson r >= "
          f"{MIN_R} and mean absolute difference < {MAX_MEAN_ABS_DEG} deg per site.\n")  # fmt: skip
    print(
        "| Site | Ours, mean (deg) | LOLA, mean (deg) | Mean abs diff (deg) | Max abs diff (deg) | Pearson r | Pass |"
    )
    print("| --- | --- | --- | --- | --- | --- | --- |")
    ok = True
    with rasterio.open(RAW / "LDSM_80S_20MPP_ADJ.TIF") as d:
        for region in dict.fromkeys(p["region"] for p in points):
            pts = [p for p in points if p["region"] == region]
            x, y = (np.array([p[k] for p in pts]) for k in ("x", "y"))
            win = from_bounds(
                x.min() - 100, y.min() - 100, x.max() + 100, y.max() + 100, d.transform
            )
            win = win.round_offsets().round_lengths()
            grid = d.read(1, window=win).astype(np.float64) * (d.scales[0] or 1.0)
            left, _, _, top = d.window_bounds(win)
            ref = sample(grid, left, top, d.res[0], x, y)
            ours = np.fromfile(DATA / "slopes" / f"{region}.bin", "u1").astype(np.float64)
            assert ours.size == len(pts) and np.isfinite(ref).all(), region
            r = float(np.corrcoef(ours, ref)[0, 1])
            diff = np.abs(ours - ref)
            good = r >= MIN_R and diff.mean() < MAX_MEAN_ABS_DEG
            ok &= good
            print(f"| {sites[region]['name']} | {ours.mean():.1f} | {ref.mean():.1f} | {diff.mean():.2f} "
                  f"| {diff.max():.1f} | {r:.3f} | {'yes' if good else 'NO'} |")  # fmt: skip
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
