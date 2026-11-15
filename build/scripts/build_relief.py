"""Elevation grids for the Moon view's 3D relief, real-Sun shading and Topo layer (D67):
basemaps/relief/{globe,pole,context/{site}}.png, 16-bit, heights above R = 1,737,400 m.

Needs only data/raw/LDEM_80S_20MPP_ADJ.TIF and data/raw/globe/ldem_16.img (`make data-download`):
- globe: LDEM_16 radius - R, bilinear to 2048 x 1024 (globe.png's grid), averaged to 1024 x 512;
- pole: the 20 m DEM averaged to 1024 x 1024 over +-304 km (about 594 m per pixel);
- context: per terrain site, the 20 m DEM averaged to 1024 x 1024 over +-32 km (62.5 m per pixel).
Writes the PNGs and the `relief` entry of basemap.json.
"""

import json
import time
from pathlib import Path

import numpy as np
import rasterio
from build_globe import RAW as GLOBE_RAW
from build_globe import label
from rasterio.enums import Resampling
from rasterio.windows import from_bounds

from horizonwalk import export
from horizonwalk.geo import latlon_to_xy

ROOT = Path(__file__).resolve().parents[2]
RAW, OUT = ROOT / "data" / "raw", ROOT / "web" / "public" / "data"
R_M = 1_737_400.0
N = export.RELIEF_PX


def globe_heights() -> np.ndarray:
    lbl = (GLOBE_RAW / "ldem_16.lbl").read_text()
    lines, samples = int(label(lbl, "LINES")), int(label(lbl, "LINE_SAMPLES"))
    scale, offset = float(label(lbl, "SCALING_FACTOR")), float(label(lbl, "OFFSET"))
    assert (lines, samples) == (2880, 5760), "expected the 16 px/deg grid"
    dn = np.fromfile(GLOBE_RAW / "ldem_16.img", dtype="<i2").reshape(lines, samples)
    assert offset == R_M, "LDEM_16 radii are offset from the 1737.4 km sphere"
    g = export.globe_resample(dn.astype(np.float64) * scale)
    # 2 x 2 averaged to 1024 x 512 (about 10 km per pixel): it only shapes the 2-degree globe mesh
    return g.reshape(g.shape[0] // 2, 2, g.shape[1] // 2, 2).mean(axis=(1, 3))


def averaged(dem, bounds: tuple[float, float, float, float]) -> np.ndarray:
    """The DEM inside bounds (left, bottom, right, top), averaged to N x N; NaN cells filled from the mean."""
    win = from_bounds(*bounds, dem.transform)
    h = dem.read(1, window=win, out_shape=(N, N), resampling=Resampling.average, boundless=False)
    h = h.astype(np.float64)
    bad = ~np.isfinite(h)
    assert bad.mean() < 0.01, f"{bad.mean():.1%} of cells without data"
    h[bad] = np.nanmean(h)
    return h


def main() -> None:
    t0 = time.time()
    sites = json.loads((OUT / "sites.json").read_text())["sites"]
    globe = globe_heights()
    half = export.CONTEXT_HALF_M
    with rasterio.open(RAW / "LDEM_80S_20MPP_ADJ.TIF") as dem:
        b = dem.bounds
        assert min(-b.left, b.right, -b.bottom, b.top) >= export.POLE_HALF_M, b
        p = export.POLE_HALF_M
        pole = averaged(dem, (-p, -p, p, p))
        ctx = {}
        for s in sites:
            if s["terrain"]:
                cx, cy = (float(v) for v in latlon_to_xy(s["lat"], s["lon"]))
                ctx[s["id"]] = averaged(dem, (cx - half, cy - half, cx + half, cy + half))
    export.write_relief(
        OUT,
        globe,
        pole,
        ctx,
        {
            "globe": "LOLA LDEM_16 (LRO-L-LOLA-4-GDR-V1.0, 16 px/deg)",
            "polar": "LOLA 20 m polar DEM (LDEM_80S_20MPP_ADJ), averaged",
        },
        synthetic=False,
    )
    rel = OUT / "basemaps" / "relief"
    for f in sorted(rel.rglob("*.png")):
        print(f"{f.relative_to(OUT)}: {f.stat().st_size / 1e6:.2f} MB")
    print(
        f"globe {globe.min():.0f}..{globe.max():.0f} m, pole {pole.min():.0f}..{pole.max():.0f} m "
        f"({time.time() - t0:.0f} s)"
    )


if __name__ == "__main__":
    main()
