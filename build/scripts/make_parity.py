"""Write shared/fixtures/engine_cases.json: fixed inputs and the Python engine's outputs.

`make parity` regenerates it and runs the TypeScript engine against it (web/src/engine/engine.test.ts).
"""

import json
from pathlib import Path

import numpy as np

from horizonwalk import engine

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "web" / "public" / "data"


def main() -> None:
    table = np.fromfile(DATA / "ephemeris" / "2026.bin", "<f4").reshape(-1, 7)
    points = json.loads((DATA / "points.json").read_text())["points"]
    cases = []
    for region, start in (
        ("change7-shackleton-rim", 7000),
        ("im2-mons-mouton", 1234),
        ("connecting-ridge", 5000),
    ):
        p = next(q for q in points if q["region"] == region and q["index"] == 220)
        raw = np.fromfile(DATA / "masks" / f"{region}.bin", "<u2").reshape(-1, 360)[220]
        rows = table[start : start + 24 * 30 : 15]  # 48 rows across a lunar month
        sun_az, sun_el, earth_az, earth_el = engine.site_angles(
            rows, p["lat"], p["lon"], p["elev_m"]
        )
        mask = engine.decode_mask(raw)
        sun_mask, earth_mask = engine.mask_at(mask, sun_az), engine.mask_at(mask, earth_az)
        cases.append({
            "site": {"lat": p["lat"], "lon": p["lon"], "elev_m": p["elev_m"]},
            "mask_raw": raw.tolist(),
            "rows": [[float(v) for v in r] for r in rows],
            "expect": {
                "sun_az": sun_az.tolist(), "sun_el": sun_el.tolist(),
                "earth_az": earth_az.tolist(), "earth_el": earth_el.tolist(),
                "sun_mask": sun_mask.tolist(), "earth_mask": earth_mask.tolist(),
                "sun_fraction": engine.sun_fraction(sun_el, sun_mask).tolist(),
                "earth_visible": engine.earth_visible(earth_el, earth_mask).tolist(),
            },
        })  # fmt: skip
    (ROOT / "shared" / "fixtures" / "engine_cases.json").write_text(
        json.dumps({"cases": cases}) + "\n"
    )
    lit = sum(f > 0 for c in cases for f in c["expect"]["sun_fraction"])
    print(f"wrote {len(cases)} cases, {sum(len(c['rows']) for c in cases)} rows ({lit} lit)")


if __name__ == "__main__":
    main()
