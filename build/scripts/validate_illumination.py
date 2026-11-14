"""Our sunlit % per grid point vs the PGDA average solar illumination maps (Mazarico et al. 2011).

Prints Markdown, appended to docs/VALIDATION.md by `make validate`. Needs the AVGVISIB GeoTIFFs in
data/raw/ (`make data-download`).

The two are not the same quantity, so this is a pattern check, not an equality check:
ours is the mean visible fraction of the solar disk at 2 m above 20 m terrain over 2026-2035;
PGDA's is the same kind of average at the surface of a 60 m (or 120 m) terrain over 18.6 years.
"""

import json
import sys
from pathlib import Path

import numpy as np
import rasterio

from horizonwalk import engine
from horizonwalk.masks import sample

ROOT = Path(__file__).resolve().parents[2]
RAW, DATA = ROOT / "data" / "raw", ROOT / "web" / "public" / "data"
MAPS = ("AVGVISIB_85S_060M_201608.TIF", "AVGVISIB_75S_120M_201608.TIF")  # finest first
MIN_R = 0.5  # pattern agreement we expect across each site's 441 grid points


def main() -> int:
    meta = json.loads((DATA / "ephemeris.json").read_text())
    assert not meta["synthetic"], "run `make data` first: validation needs the real data"
    table = np.concatenate(
        [np.fromfile(DATA / y["file"], "<f4").reshape(-1, 7) for y in meta["years"].values()]
    )
    points = json.loads((DATA / "points.json").read_text())["points"]
    sites = {s["id"]: s for s in json.loads((DATA / "sites.json").read_text())["sites"]}
    maps = []
    for name in MAPS:
        with rasterio.open(RAW / name) as d:
            a = d.read(1).astype(np.float64)
            a[a == d.nodata] = np.nan
            maps.append((name, a * d.scales[0], d.bounds.left, d.bounds.top, d.res[0]))

    print("\n## Sunlit % vs PGDA average solar illumination (Mazarico et al. 2011)\n")
    print(f"Ours: mean Sun visible fraction over all {len(table):,} hours of 2026-2035, 2 m above "
          "the 20 m terrain, at each of a site's 441 grid points (500 m spacing). PGDA: the "
          "18.6-year average at the surface, sampled at the same points from the finest map that "
          "covers the site. Different height, resolution and time span, so the check is the "
          f"spatial pattern: Pearson r >= {MIN_R} per site.\n")  # fmt: skip
    print("| Site | PGDA map | Ours, site point (%) | PGDA, site point (%) | Ours, grid mean (%) "
          "| PGDA, grid mean (%) | Mean difference (pts) | Pearson r | Pass |")  # fmt: skip
    print("| --- | --- | --- | --- | --- | --- | --- | --- | --- |")
    ok, centre = True, {}
    for region in dict.fromkeys(p["region"] for p in points):
        pts = [p for p in points if p["region"] == region]
        masks = engine.decode_mask(np.fromfile(DATA / "masks" / f"{region}.bin", "<u2")).reshape(
            -1, 360
        )
        ours = np.empty(len(pts))
        for i, p in enumerate(pts):
            sun_az, sun_el, _, _ = engine.site_angles(table, p["lat"], p["lon"], p["elev_m"])
            ours[i] = engine.sun_fraction(sun_el, engine.mask_at(masks[i], sun_az)).mean() * 100
        x, y = (np.array([p[k] for p in pts]) for k in ("x", "y"))
        for name, grid, left, top, res in maps:
            ref = sample(grid, left, top, res, x, y) * 100
            if np.isfinite(ref).all():
                break
        else:
            raise SystemExit(f"{region}: no PGDA map covers this site")
        r = float(np.corrcoef(ours, ref)[0, 1])
        good = r >= MIN_R
        ok &= good
        centre[region] = (ours[220], ref[220])
        print(f"| {sites[region]['name']} | {name.split('_')[2]} | {ours[220]:.1f} | {ref[220]:.1f} "
              f"| {ours.mean():.1f} | {ref.mean():.1f} | {(ours - ref).mean():+.1f} | {r:.2f} "
              f"| {'yes' if good else 'NO'} |")  # fmt: skip
        print(f"{region} done", file=sys.stderr, flush=True)

    rank = sorted(centre, key=lambda k: -centre[k][0])
    place = rank.index("connecting-ridge") + 1
    top3 = place <= 3
    ok &= top3
    print(f"\nSite points ranked by our sunlit %: {', '.join(sites[k]['name'] for k in rank)}.")
    print(f"\nConnecting Ridge is number {place} of {len(rank)} "
          f"({'among the best-lit, as the spec expects' if top3 else 'NOT among the best-lit'}).")  # fmt: skip
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
