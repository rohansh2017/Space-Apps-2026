"""make data: real ephemeris, horizon masks, slopes and heightmaps into web/public/data/."""

import json
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from horizonwalk import ephem, export
from horizonwalk.geo import latlon_to_xy, xy_to_latlon
from horizonwalk.masks import horizon_masks, sample

ROOT = Path(__file__).resolve().parents[2]
RAW, OUT = ROOT / "data" / "raw", ROOT / "web" / "public" / "data"
NEAR_HALF_M = 16_000.0  # 5 km grid reach + 10 km near-field handover + margin


def main(only: list[str]) -> None:
    t0 = time.time()
    src = json.loads((ROOT / "build" / "sites_src.json").read_text())
    export.write_ephemeris(
        OUT, {y: ephem.year_table(y) for y in range(2026, 2036)}, synthetic=False
    )
    print(f"ephemeris 2026-2035 written ({time.time() - t0:.0f} s)", flush=True)

    with rasterio.open(RAW / "LDEM_80S_80MPP_ADJ.TIF") as d:
        far, far_left, far_top, far_res = d.read(1), d.bounds.left, d.bounds.top, d.res[0]
    assert abs(far_left + export.POLE_HALF_M) < 1 and far.shape[0] % 10 == 0, "unexpected 80 m DEM"
    # polar basemap: block-mean to 800 m per pixel, relief exaggerated so it reads at that scale
    coarse = far.reshape(far.shape[0] // 10, 10, far.shape[1] // 10, 10).mean(axis=(1, 3))
    pole_map = export.hillshade(coarse, far_res * 10, exaggeration=4.0)
    sites, points, region_maps = [], [], {}
    with rasterio.open(RAW / "LDEM_80S_20MPP_ADJ.TIF") as dem:
        for s in src["sites"]:
            if not s["terrain"] or (only and s["id"] not in only):
                sites.append(dict(s, heightmap=None))
                continue
            cx, cy = (float(v) for v in latlon_to_xy(s["lat"], s["lon"]))
            win = from_bounds(cx - NEAR_HALF_M, cy - NEAR_HALF_M, cx + NEAR_HALF_M, cy + NEAR_HALF_M,
                              dem.transform).round_offsets().round_lengths()  # fmt: skip
            near = dem.read(1, window=win)
            left, _, _, top = dem.window_bounds(win)
            res = dem.res[0]
            x, y = export.grid_xy(cx, cy)
            lat, lon = xy_to_latlon(x, y)
            elev, masks = horizon_masks(
                lat, lon, near, left, top, res, far, far_left, far_top, far_res
            )
            assert np.isfinite(elev).all() and np.isfinite(masks).all(), s["id"]
            gy, gx = np.gradient(near.astype(np.float64), res)
            slope = np.degrees(np.arctan(np.hypot(gx, gy))).astype(np.float32)
            slopes = sample(slope, left, top, res, x, y)
            # heightmap in local east/north axes (row 0 = north edge), scaled by the map scale factor
            lam, k = np.radians(s["lon"]), 2.0 / (1.0 + np.sin(np.radians(-s["lat"])))
            c = (
                np.arange(export.HM_N) + 0.5
            ) / export.HM_N * export.HM_SPAN_M - export.HM_SPAN_M / 2
            e, n = np.meshgrid(c * k, -c * k)
            hx = cx + e * np.cos(lam) + n * np.sin(lam)
            hy = cy - e * np.sin(lam) + n * np.cos(lam)
            heights = sample(near, left, top, res, hx.ravel(), hy.ravel()).reshape(hx.shape)
            assert np.isfinite(heights).all(), s["id"]
            half = int(export.REGION_HALF_M / res)
            col, row = round((cx - left) / res), round((top - cy) / res)
            region_maps[s["id"]] = export.hillshade(
                near[row - half : row + half, col - half : col + half], res
            )
            entry, pts = export.write_region(OUT, s, lat, lon, x, y, elev, masks, slopes, heights)
            sites.append(entry)
            points += pts
            print(f"{s['id']}: elev {elev[220]:.0f} m, mask {masks[220].min():.2f}..{masks[220].max():.2f} deg "
                  f"({time.time() - t0:.0f} s)", flush=True)  # fmt: skip
    export.write_index(OUT, sites, points, synthetic=False)
    export.write_basemap(OUT, pole_map, region_maps, synthetic=False)
    tour = json.loads((ROOT / "build" / "tour_src.json").read_text())
    export.write_json(OUT / "tour.json", {"synthetic": False, **tour})
    print(f"done: {len(sites)} sites, {len(points)} points")


if __name__ == "__main__":
    main(sys.argv[1:])
