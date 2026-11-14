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
    metrics_fixture(table, points)


def metrics_fixture(table, points) -> None:
    """Hourly series for three sites with expected window metrics, events and constraint results."""
    schema = json.loads((DATA / "constraints.schema.json").read_text())["constraints"]
    defaults = {c["id"]: c["default"] for c in schema}
    strict = dict(defaults, mission_duration_days=10, min_continuous_sun_days=9, max_continuous_dark_hours=12,
                  min_earth_visible_pct=60, landing_sun_and_earth_visible=False)  # fmt: skip
    cases = []
    for region, start in (
        ("change7-shackleton-rim", 7000),
        ("im2-mons-mouton", 1234),
        ("connecting-ridge", 5000),
    ):
        p = next(q for q in points if q["region"] == region and q["index"] == 220)
        mask = engine.decode_mask(
            np.fromfile(DATA / "masks" / f"{region}.bin", "<u2").reshape(-1, 360)[220]
        )
        sun_az, sun_el, earth_az, earth_el = engine.site_angles(
            table[start : start + 720], p["lat"], p["lon"], p["elev_m"]
        )
        frac = engine.sun_fraction(sun_el, engine.mask_at(mask, sun_az))
        earth = engine.earth_visible(earth_el, engine.mask_at(mask, earth_az))
        windows = []
        for w_start, hours, deck in (
            (0, 168, False),
            (100, 168, False),
            (333, 240, True),
            (0, 720, False),
            (500, 48, False),
        ):
            m = engine.window_metrics(frac, earth, sun_el, w_start, hours, deck)
            windows.append({
                "start": w_start, "hours": hours, "deck": deck, "metrics": m,
                "default": engine.evaluate(m, 7.0, defaults), "strict": engine.evaluate(m, 12.0, strict),
            })  # fmt: skip
        events = [{"t": t, "sun": engine.next_change(frac > 0, t), "earth": engine.next_change(earth, t)}
                  for t in (0, 50, 200, 431, 719)]  # fmt: skip
        cases.append({"frac": frac.tolist(), "earth": earth.astype(int).tolist(), "sun_el": sun_el.tolist(),
                      "windows": windows, "events": events})  # fmt: skip
    out = {
        "constraints": {"default": defaults, "strict": strict},
        "slopes": {"default": 7.0, "strict": 12.0},
        "cases": cases,
    }
    (ROOT / "shared" / "fixtures" / "metrics_cases.json").write_text(json.dumps(out) + "\n")
    print(
        f"wrote metrics fixture: {len(cases)} series, {sum(len(c['windows']) for c in cases)} windows"
    )


if __name__ == "__main__":
    main()
