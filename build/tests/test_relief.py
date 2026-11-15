"""Relief grids (D67): the 16-bit encoding keeps heights to within half a quantum."""

import json
import struct
import zlib
from pathlib import Path

import numpy as np
import pytest

from horizonwalk import export


def read_png16(path) -> np.ndarray:
    b = path.read_bytes()
    w, h = struct.unpack(">II", b[16:24])
    i, dat = 8, b""
    while i < len(b):
        n = struct.unpack(">I", b[i : i + 4])[0]
        if b[i + 4 : i + 8] == b"IDAT":
            dat += b[i + 8 : i + 8 + n]
        i += 12 + n
    lines = np.frombuffer(zlib.decompress(dat), np.uint8).reshape(h, 1 + 2 * w)
    rows = lines[:, 1:].copy()
    for r in range(h):
        assert lines[r, 0] in (0, 2)
        if lines[r, 0] == 2 and r:
            rows[r] += rows[r - 1]  # Up filter; uint8 wraps modulo 256
    return rows.view(">u2").reshape(h, w).astype(np.float64)


def test_relief_round_trip_within_half_a_step(tmp_path):
    rng = np.random.default_rng(1)
    (tmp_path / "basemap.json").write_text(json.dumps({"synthetic": False}))
    globe, pole = rng.normal(0, 3000, (8, 16)), rng.normal(0, 3000, (16, 16))
    ctx = {"a": rng.normal(1500, 400, (16, 16))}
    cap = rng.normal(0, 3000, (24, 24))
    src = {"globe": "t", "polar": "t", "cap": "t"}
    export.write_relief(tmp_path, globe, pole, ctx, src, synthetic=False, cap_m=cap)
    rel = json.loads((tmp_path / "basemap.json").read_text())["relief"]
    assert rel["cap"]["half_width_m"] == export.CAP_HALF_M and rel["cap"]["size_px"] == 24
    for entry, want in [
        (rel["globe"], globe),
        (rel["cap"], cap),
        (rel["pole"], pole),
        (rel["context"]["files"]["a"], ctx["a"]),
    ]:
        got = read_png16(tmp_path / entry["file"]) * entry["scale_m"] + entry["offset_m"]
        assert np.abs(got - want).max() <= entry["scale_m"] / 2 + 1e-9
        assert entry["offset_m"] == want.min() and entry["max_m"] == want.max()
    assert rel["context"]["size_px"] == 16 and rel["pole"]["half_width_m"] == export.POLE_HALF_M


def test_relief_agrees_with_the_grid_heights_at_each_site():
    """The shipped grids, read in their documented axes, give each site's LOLA height (points.json)."""
    data = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
    meta = json.loads((data / "basemap.json").read_text())
    if meta.get("synthetic") or "relief" not in meta:
        pytest.skip("real data only")
    rel = meta["relief"]
    pts = json.loads((data / "points.json").read_text())["points"]
    pole = rel["pole"]
    ph = read_png16(data / pole["file"]) * pole["scale_m"] + pole["offset_m"]

    def at(h, x, y, cx, cy, half):  # bilinear, row 0 = +y, col 0 = -x, pixel-registered
        n = h.shape[0]
        c, r = (x - cx + half) / (2 * half) * n - 0.5, (cy + half - y) / (2 * half) * n - 0.5
        c0, r0 = int(c), int(r)
        fc, fr = c - c0, r - r0
        top = h[r0, c0] * (1 - fc) + h[r0, c0 + 1] * fc
        return top * (1 - fr) + (h[r0 + 1, c0] * (1 - fc) + h[r0 + 1, c0 + 1] * fc) * fr

    cap = rel.get("cap")
    capH = read_png16(data / cap["file"]) * cap["scale_m"] + cap["offset_m"] if cap else None
    worst = [0.0, 0.0, 0.0]
    for sid, entry in rel["context"]["files"].items():
        p = next(q for q in pts if q["region"] == sid and q["index"] == 220)
        ch = read_png16(data / entry["file"]) * entry["scale_m"] + entry["offset_m"]
        half = rel["context"]["half_width_m"]
        worst[0] = max(worst[0], abs(at(ch, p["x"], p["y"], p["x"], p["y"], half) - p["elev_m"]))
        worst[1] = max(
            worst[1], abs(at(ph, p["x"], p["y"], 0, 0, pole["half_width_m"]) - p["elev_m"])
        )
        if capH is not None:  # D71: the 75S 240 m DEM, averaged to 480 m
            d = abs(at(capH, p["x"], p["y"], 0, 0, cap["half_width_m"]) - p["elev_m"])
            worst[2] = max(worst[2], d)
    print(f"context within {worst[0]:.2f} m, polar {worst[1]:.1f} m, cap {worst[2]:.1f} m")
    assert worst[0] < 2.0 and worst[1] < 100.0 and worst[2] < 150.0
