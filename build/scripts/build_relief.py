"""Elevation grids for the Moon view's 3D relief, real-Sun shading and Topo layer (D67):
basemaps/relief/{globe,pole,context/{site}}.png, 16-bit, heights above R = 1,737,400 m.

Needs only data/raw/LDEM_80S_20MPP_ADJ.TIF, data/raw/globe/ldem_16.img and
data/raw/polar/ldem_75s_240m.img (`make data-download`):
- globe: LDEM_16 radius - R, bilinear to 3072 x 1536 (D71);
- cap: the LOLA 75S 240 m polar DEM averaged 2 x 2 to 1900 x 1900 over +-456 km (480 m per pixel, D71);
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
POLAR_RAW = RAW / "polar"


def globe_heights() -> np.ndarray:
    lbl = (GLOBE_RAW / "ldem_16.lbl").read_text()
    lines, samples = int(label(lbl, "LINES")), int(label(lbl, "LINE_SAMPLES"))
    scale, offset = float(label(lbl, "SCALING_FACTOR")), float(label(lbl, "OFFSET"))
    assert (lines, samples) == (2880, 5760), "expected the 16 px/deg grid"
    dn = np.fromfile(GLOBE_RAW / "ldem_16.img", dtype="<i2").reshape(lines, samples)
    assert offset == R_M, "LDEM_16 radii are offset from the 1737.4 km sphere"
    # 3072 x 1536 (D71): beyond the polar cap the shading's slopes come from this grid
    w = export.RELIEF_GLOBE_W
    return export.globe_resample(dn.astype(np.float64) * scale, w, w // 2)


def cap_heights() -> np.ndarray:
    """The LOLA 75S polar DEM (PDS IMG, south polar stereographic on R, pixel-registered, row 0 = +y,
    col 0 = -x: our axes) averaged to CAP_PX x CAP_PX over +-CAP_HALF_M (D71)."""
    lbl = (POLAR_RAW / "ldem_75s_240m.lbl").read_text()
    n = int(label(lbl, "LINES"))
    assert n == int(label(lbl, "LINE_SAMPLES")) and label(lbl, "SAMPLE_BITS") == "16"
    assert label(lbl, "SAMPLE_TYPE") == "LSB_INTEGER" and float(label(lbl, "OFFSET")) == R_M
    assert "POLAR STEREOGRAPHIC" in lbl and float(label(lbl, "CENTER_LATITUDE").split()[0]) == -90
    assert abs(float(label(lbl, "A_AXIS_RADIUS")) * 1000 - R_M) < 1e-6
    res = float(label(lbl, "MAP_SCALE").split()[0])
    off = float(label(lbl, "LINE_PROJECTION_OFFSET").split()[0])
    assert off == float(label(lbl, "SAMPLE_PROJECTION_OFFSET").split()[0]) == (n - 1) / 2, off
    h = np.fromfile(POLAR_RAW / "ldem_75s_240m.img", dtype="<i2").reshape(n, n)
    h = h.astype(np.float64) * float(label(lbl, "SCALING_FACTOR"))
    half, m = n * res / 2, export.CAP_PX
    assert half >= export.CAP_HALF_M, half
    # crop to +-CAP_HALF_M, then average f x f source pixels per output pixel (exact, no resampling shift)
    cut = round((half - export.CAP_HALF_M) / res)
    h = h[cut : n - cut, cut : n - cut]
    f = h.shape[0] // m
    assert h.shape[0] == f * m and abs(h.shape[0] * res / 2 - export.CAP_HALF_M) < 1e-6, h.shape
    return h.reshape(m, f, m, f).mean(axis=(1, 3))


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
    cap = cap_heights()
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
            "cap": "LOLA 75S polar DEM (LDEM_75S_240M, LRO-L-LOLA-4-GDR-V1.0, 240 m), averaged",
        },
        synthetic=False,
        cap_m=cap,
    )
    rel = OUT / "basemaps" / "relief"
    for f in sorted(rel.rglob("*.png")):
        print(f"{f.relative_to(OUT)}: {f.stat().st_size / 1e6:.2f} MB")
    print(
        f"globe {globe.min():.0f}..{globe.max():.0f} m, cap {cap.min():.0f}..{cap.max():.0f} m, pole {pole.min():.0f}..{pole.max():.0f} m "
        f"({time.time() - t0:.0f} s)"
    )


if __name__ == "__main__":
    main()
