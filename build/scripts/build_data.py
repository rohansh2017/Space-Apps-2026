"""make data: real ephemeris, horizon masks, slopes and heightmaps into web/public/data/."""

import json
import sys
import time
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import from_bounds

from horizonwalk import ephem, export, stars
from horizonwalk.geo import latlon_to_xy, xy_to_latlon
from horizonwalk.masks import horizon_masks, sample

ROOT = Path(__file__).resolve().parents[2]
RAW, OUT = ROOT / "data" / "raw", ROOT / "web" / "public" / "data"
NEAR_HALF_M = 16_000.0  # 5 km grid reach + 10 km near-field handover + margin


def local_grid(cx: float, cy: float, lam: float, k: float, n: int):
    """Stereographic x/y of an n x n heightmap in the site's local east/north axes (row 0 = north edge)."""
    c = (np.arange(n) + 0.5) / n * export.HM_SPAN_M - export.HM_SPAN_M / 2
    e, nn = np.meshgrid(c * k, -c * k)
    return cx + e * np.cos(lam) + nn * np.sin(lam), cy - e * np.sin(lam) + nn * np.cos(lam)


def heightmap_5m(cx: float, cy: float, lam: float, k: float):
    """(heights, source) from the first PGDA 78 5 m DEM that covers the whole patch, or None."""
    hx, hy = local_grid(cx, cy, lam, k, export.HM_N_5M)
    for path in sorted((RAW / "5m").glob("*_surf.tif")):
        with rasterio.open(path) as d:
            b = d.bounds
            if not (
                b.left + 20 < hx.min()
                and hx.max() < b.right - 20
                and b.bottom + 20 < hy.min()
                and hy.max() < b.top - 20
            ):
                continue
            win = from_bounds(
                hx.min() - 20, hy.min() - 20, hx.max() + 20, hy.max() + 20, d.transform
            )
            win = win.round_offsets().round_lengths()
            dem = d.read(1, window=win).astype(np.float64)
            left, _, _, top = d.window_bounds(win)
            heights = sample(dem, left, top, d.res[0], hx.ravel(), hy.ravel()).reshape(hx.shape)
            if np.isfinite(heights).all():
                return heights, f"LOLA 5 m site DEM, PGDA product 78 ({path.name.split('_')[0]})"
    return None


def write_orientation_fixture(tables: dict, orientation: dict) -> None:
    """Hours where the TS engine must rotate Skyfield's apparent ICRF Sun onto the stored ephemeris Sun."""
    ts = ephem.timescale()
    cases = []
    for year in (2026, 2030, 2035):
        for hour in (0, 1234, 5000, 8000):
            sun = ephem.sun_icrf(ts.utc(year, 1, 1, hour))
            cases.append({
                "year": year, "hour": hour, "q": orientation[year][hour].tolist(),
                "sun_icrf": sun.tolist(), "row": tables[year][hour].tolist(),
            })  # fmt: skip
    export.write_json(ROOT / "shared" / "fixtures" / "orientation_cases.json", {"cases": cases})


def main(only: list[str]) -> None:
    t0 = time.time()
    src = json.loads((ROOT / "build" / "sites_src.json").read_text())
    years = range(2026, 2036)
    tables = {y: ephem.year_table(y) for y in years}
    orientation = {y: ephem.year_orientation(y) for y in years}
    export.write_ephemeris(OUT, tables, orientation, synthetic=False)
    write_orientation_fixture(tables, orientation)
    catalogue = stars.read(RAW / "bsc5.dat.gz")
    export.write_stars(
        OUT,
        catalogue,
        "Yale Bright Star Catalogue, 5th ed. (BSC5, Hoffleit & Warren 1991)",
        synthetic=False,
    )
    print(
        f"ephemeris, orientation 2026-2035 and {len(catalogue)} stars written ({time.time() - t0:.0f} s)",
        flush=True,
    )

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
            hx, hy = local_grid(cx, cy, lam, k, export.HM_N)
            heights = sample(near, left, top, res, hx.ravel(), hy.ravel()).reshape(hx.shape)
            assert np.isfinite(heights).all(), s["id"]
            hm_source = "LOLA 20 m polar DEM (LDEM_80S_20MPP_ADJ)"
            fine = heightmap_5m(cx, cy, lam, k)
            if fine is not None:
                heights, hm_source = fine
            half = int(export.REGION_HALF_M / res)
            col, row = round((cx - left) / res), round((top - cy) / res)
            region_maps[s["id"]] = export.hillshade(
                near[row - half : row + half, col - half : col + half], res
            )
            entry, pts = export.write_region(
                OUT, s, lat, lon, x, y, elev, masks, slopes, heights, hm_source
            )
            sites.append(entry)
            points += pts
            print(f"{s['id']}: elev {elev[220]:.0f} m, mask {masks[220].min():.2f}..{masks[220].max():.2f} deg, "
                  f"heightmap {heights.shape[0]} px from {hm_source} ({time.time() - t0:.0f} s)", flush=True)  # fmt: skip
    export.write_index(OUT, sites, points, synthetic=False)
    export.write_basemap(OUT, pole_map, region_maps, synthetic=False)
    tour = json.loads((ROOT / "build" / "tour_src.json").read_text())
    export.write_json(OUT / "tour.json", {"synthetic": False, **tour})
    print(f"done: {len(sites)} sites, {len(points)} points")


if __name__ == "__main__":
    main(sys.argv[1:])
