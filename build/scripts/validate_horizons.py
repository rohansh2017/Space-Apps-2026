"""Engine az/el vs JPL Horizons topocentric output (quantity 4). Prints Markdown for docs/VALIDATION.md.

Horizons responses are cached in build/cache/ so reruns work offline.
"""

import hashlib
import json
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import numpy as np
import requests

from horizonwalk import engine

CACHE = Path(__file__).resolve().parents[1] / "cache"
DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
# id: (lat, lon east-positive, elevation m). Elevation 0 on both sides. Three Apollo sites, three polar.
SITES = {
    "apollo11": (0.67, 23.47, 0.0),
    "apollo15": (26.13, 3.63, 0.0),
    "apollo17": (20.19, 30.77, 0.0),
    "connecting-ridge": (-89.463, -137.49, 0.0),
    "change7-shackleton-rim": (-88.8, 123.4, 0.0),
    "im2-mons-mouton": (-84.78, 29.13, 0.0),
}
START, HOURS = datetime(2026, 11, 20, tzinfo=UTC), 720  # about one lunar month
TARGET_DEG = 0.1


def horizons(body: str, lat: float, lon: float, elev_m: float) -> np.ndarray:
    """Rows of (az, el) degrees, hourly from START."""
    params = {
        "format": "text", "COMMAND": f"'{body}'", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES",
        "EPHEM_TYPE": "OBSERVER", "CENTER": "'coord@301'", "COORD_TYPE": "GEODETIC",
        "SITE_COORD": f"'{lon},{lat},{elev_m / 1000}'",
        "START_TIME": f"'{START:%Y-%m-%d %H:%M}'",
        "STOP_TIME": f"'{START + timedelta(hours=HOURS - 1):%Y-%m-%d %H:%M}'",
        "STEP_SIZE": "'1 h'", "QUANTITIES": "'4'", "ANG_FORMAT": "DEG", "CSV_FORMAT": "YES",
    }  # fmt: skip
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()[:16]
    path = CACHE / f"horizons_{key}.txt"
    if not path.exists():
        r = requests.get("https://ssd.jpl.nasa.gov/api/horizons.api", params=params, timeout=60)
        r.raise_for_status()
        assert "$$SOE" in r.text, r.text[-600:]
        CACHE.mkdir(exist_ok=True)
        path.write_text(r.text)
    table = path.read_text().split("$$SOE")[1].split("$$EOE")[0].strip().splitlines()
    rows = np.array([[float(v) for v in line.split(",")[3:5]] for line in table])
    assert rows.shape == (HOURS, 2), rows.shape
    return rows


def main() -> int:
    meta = json.loads((DATA / "ephemeris.json").read_text())
    assert not meta["synthetic"], "run `make data` first: validation needs the real ephemeris"
    first = int((START - datetime(2026, 1, 1, tzinfo=UTC)).total_seconds() // 3600)
    table = np.fromfile(DATA / "ephemeris" / "2026.bin", "<f4").reshape(-1, 7)[
        first : first + HOURS
    ]
    print("# Validation\n\nMeasured values only. Regenerate with `make validate`.\n")
    print(f"## Engine vs JPL Horizons (quantity 4), frame {meta['frame']}\n")
    print("Engine angles are computed from the shipped Float32 ephemeris table "
          "(`web/public/data/ephemeris/2026.bin`) with `horizonwalk.engine.site_angles`.\n")  # fmt: skip
    print(f"Window: {HOURS} hourly steps from {START:%Y-%m-%d %H:%M} UTC. Target: < {TARGET_DEG} deg. "
          "Azimuth error is scaled by cos(elevation).\n")  # fmt: skip
    print(
        "| Site | Body | Max az error (deg) | Max el error (deg) | Pass |\n| --- | --- | --- | --- | --- |"
    )
    ok = True
    for site, (lat, lon, elev) in SITES.items():
        angles = engine.site_angles(table, lat, lon, elev)
        for name, code, az, el in (("Sun", "10", *angles[:2]), ("Earth", "399", *angles[2:])):
            ref = horizons(code, lat, lon, elev)
            d_el = np.abs(el - ref[:, 1]).max()
            # compare azimuth as a great-circle offset so it stays meaningful near the zenith
            d_az = (np.abs((az - ref[:, 0] + 180) % 360 - 180) * np.cos(np.radians(el))).max()
            good = bool(d_az < TARGET_DEG and d_el < TARGET_DEG)
            ok &= good
            print(f"| {site} | {name} | {d_az:.5f} | {d_el:.5f} | {'yes' if good else 'NO'} |")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
