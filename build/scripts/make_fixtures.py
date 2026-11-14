"""Write SYNTHETIC, contract-shaped mock data into web/public/data/ (make data-fixtures).

Same file names, dtypes and JSON fields as the real pipeline (see CLAUDE.md, "Data contracts"),
so real files replace these with no code change. Every JSON written here carries "synthetic": true.
Hand-authored files (constraints.schema.json) are not touched.
"""

import json
import struct
import zlib
from pathlib import Path

import numpy as np

from horizonwalk.geo import latlon_to_xy, xy_to_latlon

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "web" / "public" / "data"
GRID_N, GRID_STEP_M = 21, 500.0  # 21 x 21 search grid, row-major from (-5 km, -5 km); centre = 220
HM_N, HM_SPAN_M = 256, 5000.0


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1) + "\n")


def write_png16(path: Path, img: np.ndarray) -> None:
    """16-bit greyscale PNG, row 0 = north edge (+y)."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    h, w = img.shape
    raw = b"".join(b"\x00" + row.astype(">u2").tobytes() for row in img)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 16, 0, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def ephemeris() -> None:
    """One mock year: Sun circling near the equator plane, Earth near +x with a small wobble."""
    hours = 8760
    t = np.arange(hours)
    a = 2 * np.pi * t / (29.53 * 24)
    tilt = np.radians(1.54) * np.sin(2 * np.pi * t / (346.6 * 24))
    sun = np.stack([np.cos(a) * np.cos(tilt), -np.sin(a) * np.cos(tilt), np.sin(tilt)], 1)
    lib = np.radians(6.5) * np.sin(2 * np.pi * t / (27.3 * 24))
    earth = np.stack([np.cos(lib) ** 2, np.sin(lib) * np.cos(lib), np.sin(lib)], 1)
    dist = 384_400.0 + 21_000.0 * np.cos(2 * np.pi * t / (27.55 * 24))
    table = np.column_stack([sun, earth, dist]).astype("<f4")
    assert table.shape == (hours, 7)
    (OUT / "ephemeris").mkdir(parents=True, exist_ok=True)
    table.tofile(OUT / "ephemeris" / "2026.bin")
    write_json(OUT / "ephemeris.json", {
        "synthetic": True,
        "frame": "MOON_ME_DE440_ME421",
        "start_utc": "2026-01-01T00:00:00Z",
        "step_seconds": 3600,
        "dtype": "float32-le",
        "fields": ["sun_x", "sun_y", "sun_z", "earth_x", "earth_y", "earth_z", "earth_dist_km"],
        "years": {"2026": {"file": "ephemeris/2026.bin", "hours": hours}},
    })  # fmt: skip


def main() -> None:
    src = json.loads((ROOT / "build" / "sites_src.json").read_text())
    rng = np.random.default_rng(0)
    ephemeris()
    sites, points = [], []
    for s in src["sites"]:
        site = dict(s, heightmap=None)
        if s["terrain"]:
            sid = s["id"]
            # mock terrain: a ridge to the north; mask = low rolling horizon with one peak
            yy, xx = np.mgrid[0:HM_N, 0:HM_N] / (HM_N - 1)
            h = 200 * np.exp(-((yy - 0.2) ** 2) / 0.01) + 20 * np.sin(6 * xx)
            scale = 0.01
            write_png16(OUT / "heightmaps" / f"{sid}.png", np.round((h - h.min()) / scale))
            site["heightmap"] = {
                "file": f"heightmaps/{sid}.png", "offset_m": float(h.min()), "scale_m": scale,
                "size_px": HM_N, "span_m": HM_SPAN_M,
            }  # fmt: skip
            cx, cy = latlon_to_xy(s["lat"], s["lon"])
            az = np.arange(360)
            masks = np.empty((GRID_N * GRID_N, 360), "<u2")
            for i in range(GRID_N * GRID_N):
                x = cx + (i % GRID_N - GRID_N // 2) * GRID_STEP_M
                y = cy + (i // GRID_N - GRID_N // 2) * GRID_STEP_M
                lat, lon = xy_to_latlon(x, y)
                elev = (
                    0.5
                    + 0.5 * np.sin(np.radians(3 * az + 40 * i))
                    + 3 * np.exp(-(((az - 30 - i) % 360 - 180) ** 2) / 200)
                )
                masks[i] = np.round((elev + 10.0) * 100)
                points.append({
                    "id": f"{sid}:{i}", "region": sid, "parent_site": sid, "index": i,
                    "lat": round(float(lat), 6), "lon": round(float(lon), 6),
                    "x": round(float(x), 2), "y": round(float(y), 2), "elev_m": 0.0,
                })  # fmt: skip
            (OUT / "masks").mkdir(parents=True, exist_ok=True)
            masks.tofile(OUT / "masks" / f"{sid}.bin")
            (OUT / "slopes").mkdir(parents=True, exist_ok=True)
            rng.integers(0, 25, GRID_N * GRID_N, dtype=np.uint8).tofile(
                OUT / "slopes" / f"{sid}.bin"
            )
        sites.append(site)
    write_json(OUT / "sites.json", {"synthetic": True, "sites": sites})
    write_json(OUT / "points.json", {
        "synthetic": True,
        "mask": {"dtype": "uint16-le", "bins": 360, "unit_deg": 0.01, "offset_deg": 10.0},
        "grid": {"n": GRID_N, "step_m": GRID_STEP_M, "centre_index": GRID_N * GRID_N // 2},
        "points": points,
    })  # fmt: skip
    write_json(OUT / "tour.json", {
        "synthetic": True,
        "steps": [{"id": "placeholder", "title": "Placeholder step", "body": "Mock tour text."}],
        "glossary": [{"term": "Horizon mask", "definition": "Mock glossary entry."}],
    })  # fmt: skip
    # room message example, used by the TS and Durable Object tests
    write_json(ROOT / "shared" / "fixtures" / "room_message.json", {
        "type": "state", "site_id": src["sites"][0]["id"], "utc": "2026-11-20T00:00:00Z",
        "constraints": {"mission_duration_days": 7, "max_continuous_dark_hours": 80},
        "sender": "client-1234",
    })  # fmt: skip
    print(f"wrote synthetic fixtures: {len(sites)} sites, {len(points)} grid points -> {OUT}")


if __name__ == "__main__":
    main()
