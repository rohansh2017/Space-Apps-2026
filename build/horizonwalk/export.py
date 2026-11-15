"""Writers for the data contracts (see CLAUDE.md). Used by both the real pipeline and the fixtures."""

import json
import struct
import zlib
from pathlib import Path

import numpy as np

GRID_N, GRID_STEP_M = (
    21,
    500.0,
)  # 21 x 21 search grid, row-major from (-5 km, -5 km); site = index 220
HM_N, HM_SPAN_M = 256, 5000.0  # 256 px from the 20 m DEM
HM_N_5M = 1024  # from a 5 m site DEM where one covers the patch: about 4.9 m per cell
POLE_HALF_M = 304_000.0  # the 80 m DEM covers +-304 km around the pole
REGION_HALF_M = 5_250.0  # the 21 x 21 grid reaches +-5 km; a quarter-kilometre margin
EPHEM_FIELDS = ["sun_x", "sun_y", "sun_z", "earth_x", "earth_y", "earth_z", "earth_dist_km"]


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1) + "\n")


def write_bin(path: Path, array: np.ndarray, dtype: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    array.astype(dtype).tofile(path)


def write_png16(path: Path, img: np.ndarray, depth: int = 16) -> None:
    """Greyscale PNG, 16-bit (heightmaps) or 8-bit (basemaps). Every scanline uses filter 0, which
    the web heightmap decoder relies on."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    h, w = img.shape
    raw = b"".join(b"\x00" + row.astype(">u2" if depth == 16 else "u1").tobytes() for row in img)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, depth, 0, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw))
        + chunk(b"IEND", b"")
    )


def write_ephemeris(
    out: Path, tables: dict[int, np.ndarray], orientation: dict[int, np.ndarray], synthetic: bool
) -> None:
    """tables: year -> (hours, 7) rows starting at Jan 1 00:00 UTC of that year.
    orientation: year -> (hours, 4) ICRF -> frame quaternions (w, x, y, z) for the same hours."""
    years, rot = {}, {}
    for year, table in tables.items():
        assert table.shape[1] == 7 and orientation[year].shape == (len(table), 4)
        write_bin(out / "ephemeris" / f"{year}.bin", table, "<f4")
        write_bin(out / "orientation" / f"{year}.bin", orientation[year], "<f4")
        years[str(year)] = {"file": f"ephemeris/{year}.bin", "hours": len(table)}
        rot[str(year)] = {"file": f"orientation/{year}.bin", "hours": len(table)}
    write_json(out / "ephemeris.json", {
        "synthetic": synthetic, "frame": "MOON_ME_DE440_ME421",
        "start_utc": f"{min(tables)}-01-01T00:00:00Z", "step_seconds": 3600,
        "dtype": "float32-le", "fields": EPHEM_FIELDS, "years": years,
        "orientation": {"from": "ICRF", "to": "MOON_ME_DE440_ME421", "fields": ["qw", "qx", "qy", "qz"], "years": rot},
    })  # fmt: skip


def write_stars(out: Path, stars: np.ndarray, source: str, synthetic: bool) -> None:
    """stars: (N, 5) rows of ICRF unit vector x, y, z, V magnitude, B-V (NaN when unknown)."""
    assert stars.shape[1] == 5
    write_bin(out / "stars.bin", stars, "<f4")
    write_json(out / "stars.json", {
        "synthetic": synthetic, "source": source, "file": "stars.bin", "count": len(stars),
        "frame": "ICRF (J2000)", "dtype": "float32-le", "fields": ["x", "y", "z", "vmag", "b_v"],
    })  # fmt: skip


def write_region(
    out: Path, site: dict, lat, lon, x, y, elev, masks_deg, slopes_deg, heights_m, hm_source: str
) -> tuple[dict, list]:
    """Write one site's masks, slopes and heightmap. Returns (site entry, points entries)."""
    sid = site["id"]
    write_bin(
        out / "masks" / f"{sid}.bin", np.round((np.clip(masks_deg, -10, 90) + 10.0) * 100), "<u2"
    )
    write_bin(out / "slopes" / f"{sid}.bin", np.clip(np.round(slopes_deg), 0, 255), "u1")
    lo, hi = float(heights_m.min()), float(heights_m.max())
    scale = (hi - lo) / 65535 or 1.0
    write_png16(out / "heightmaps" / f"{sid}.png", np.round((heights_m - lo) / scale))
    entry = dict(site, heightmap={
        "file": f"heightmaps/{sid}.png", "offset_m": lo, "scale_m": scale, "size_px": heights_m.shape[0],
        "span_m": HM_SPAN_M, "res_m": round(HM_SPAN_M / heights_m.shape[0], 2), "source": hm_source,
    })  # fmt: skip
    points = [
        {
            "id": f"{sid}:{i}", "region": sid, "parent_site": sid, "index": i,
            "lat": round(float(lat[i]), 6), "lon": round(float(lon[i]), 6),
            "x": round(float(x[i]), 2), "y": round(float(y[i]), 2), "elev_m": round(float(elev[i]), 2),
        }
        for i in range(len(lat))
    ]  # fmt: skip
    return entry, points


def hillshade(dem: np.ndarray, res_m: float, exaggeration: float = 1.0) -> np.ndarray:
    """8-bit hillshade lit from the upper left at 35 deg. Lighting is illustrative, not the real Sun."""
    gy, gx = np.gradient(dem.astype(np.float64) * exaggeration, res_m)
    az, alt = np.radians(315.0), np.radians(35.0)
    # image rows run down, so "up" in the image is -row; the surface normal is (-gx, gy, 1) in (right, up, out)
    shade = (np.cos(alt) * (np.sin(az) * -gx + np.cos(az) * gy) + np.sin(alt)) / np.sqrt(
        gx * gx + gy * gy + 1.0
    )
    return np.round(np.clip(shade, 0.0, 1.0) * 255)


def write_basemap(
    out: Path, pole: np.ndarray, regions: dict[str, np.ndarray], synthetic: bool
) -> None:
    """Hillshade images in stereographic x/y axes (row 0 = +y, col 0 = -x): the polar cap and one
    per region, centred on the region's site."""
    write_png16(out / "basemaps" / "pole.png", pole, depth=8)
    for sid, img in regions.items():
        write_png16(out / "basemaps" / f"{sid}.png", img, depth=8)
    write_json(out / "basemap.json", {
        "synthetic": synthetic,
        "pole": {"file": "basemaps/pole.png", "half_width_m": POLE_HALF_M},
        "regions": {"half_width_m": REGION_HALF_M, "files": {s: f"basemaps/{s}.png" for s in regions}},
    })  # fmt: skip


def write_index(out: Path, sites: list, points: list, synthetic: bool) -> None:
    write_json(out / "sites.json", {"synthetic": synthetic, "sites": sites})
    write_json(out / "points.json", {
        "synthetic": synthetic,
        "mask": {"dtype": "uint16-le", "bins": 360, "unit_deg": 0.01, "offset_deg": 10.0},
        "grid": {"n": GRID_N, "step_m": GRID_STEP_M, "centre_index": GRID_N * GRID_N // 2},
        "points": points,
    })  # fmt: skip


def grid_xy(cx: float, cy: float):
    i = np.arange(GRID_N * GRID_N)
    return cx + (i % GRID_N - GRID_N // 2) * GRID_STEP_M, cy + (
        i // GRID_N - GRID_N // 2
    ) * GRID_STEP_M
