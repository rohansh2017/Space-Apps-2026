"""make data-fixtures: SYNTHETIC, contract-shaped mock data in web/public/data/.

Uses the same writers as the real pipeline (horizonwalk.export), so the two are interchangeable.
Every JSON written here carries "synthetic": true. constraints.schema.json is hand-authored and untouched.
"""

import json
from pathlib import Path

import numpy as np

from horizonwalk import export
from horizonwalk.geo import latlon_to_xy, xy_to_latlon

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "data"


def mock_year() -> np.ndarray:
    """Sun circling near the equator plane, Earth near +x with a small wobble."""
    t = np.arange(8760)
    a = 2 * np.pi * t / (29.53 * 24)
    tilt = np.radians(1.54) * np.sin(2 * np.pi * t / (346.6 * 24))
    sun = np.stack([np.cos(a) * np.cos(tilt), -np.sin(a) * np.cos(tilt), np.sin(tilt)], 1)
    lib = np.radians(6.5) * np.sin(2 * np.pi * t / (27.3 * 24))
    earth = np.stack([np.cos(lib) ** 2, np.sin(lib) * np.cos(lib), np.sin(lib)], 1)
    dist = 384_400.0 + 21_000.0 * np.cos(2 * np.pi * t / (27.55 * 24))
    return np.column_stack([sun, earth, dist])


def main() -> None:
    src = json.loads((ROOT / "build" / "sites_src.json").read_text())
    rng = np.random.default_rng(0)
    export.write_ephemeris(OUT, {2026: mock_year()}, synthetic=True)
    sites, points = [], []
    az = np.arange(360)
    yy, xx = np.mgrid[0 : export.HM_N, 0 : export.HM_N] / (export.HM_N - 1)
    heights = 200 * np.exp(-((yy - 0.2) ** 2) / 0.01) + 20 * np.sin(6 * xx)  # a ridge to the north
    for s in src["sites"]:
        if not s["terrain"]:
            sites.append(dict(s, heightmap=None))
            continue
        x, y = export.grid_xy(*latlon_to_xy(s["lat"], s["lon"]))
        lat, lon = xy_to_latlon(x, y)
        i = np.arange(x.size)[:, None]
        masks = (
            0.5
            + 0.5 * np.sin(np.radians(3 * az + 40 * i))
            + 3 * np.exp(-(((az - 30 - i) % 360 - 180) ** 2) / 200)
        )
        entry, pts = export.write_region(
            OUT, s, lat, lon, x, y, np.zeros(x.size), masks, rng.integers(0, 25, x.size), heights
        )
        sites.append(entry)
        points += pts
    export.write_index(OUT, sites, points, synthetic=True)
    export.write_json(OUT / "tour.json", {
        "synthetic": True,
        "steps": [{"id": "placeholder", "title": "Placeholder step", "body": "Mock tour text."}],
        "glossary": [{"term": "Horizon mask", "definition": "Mock glossary entry."}],
    })  # fmt: skip
    export.write_json(ROOT / "shared" / "fixtures" / "room_message.json", {
        "type": "state", "site_id": src["sites"][0]["id"], "utc": "2026-11-20T00:00:00Z",
        "constraints": {"mission_duration_days": 7, "max_continuous_dark_hours": 80},
        "sender": "client-1234",
    })  # fmt: skip
    print(f"wrote synthetic fixtures: {len(sites)} sites, {len(points)} grid points -> {OUT}")


if __name__ == "__main__":
    main()
