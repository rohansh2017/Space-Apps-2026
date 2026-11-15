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
GLOBE_W, GLOBE_H = (
    2048,
    1024,
)  # whole-Moon hillshade, equirectangular, ~5.3 km/px at the equator (4096 px was 7.7 MB, D60)
EPHEM_FIELDS = ["sun_x", "sun_y", "sun_z", "earth_x", "earth_y", "earth_z", "earth_dist_km"]


def write_json(path: Path, obj) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=1) + "\n")


def write_bin(path: Path, array: np.ndarray, dtype: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    array.astype(dtype).tofile(path)


def write_png16(path: Path, img: np.ndarray, depth: int = 16, up: bool = False) -> None:
    """Greyscale PNG, 16-bit (heightmaps) or 8-bit (basemaps). Every scanline uses filter 0, or with
    `up` filter 2 (Up: each byte minus the one above it; smooth terrain then compresses far better).
    The web heightmap decoder handles exactly these two."""

    def chunk(tag: bytes, data: bytes) -> bytes:
        body = tag + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

    h, w = img.shape
    rows = np.stack([row.astype(">u2" if depth == 16 else "u1").view(np.uint8) for row in img])
    if up:
        rows = np.concatenate(
            [rows[:1], rows[1:] - rows[:-1]]
        )  # uint8 wraps modulo 256, as PNG does
    tag = b"\x02" if up else b"\x00"
    raw = b"".join(tag + row.tobytes() for row in rows)
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


def write_ridges(out: Path, sid: str, normals: np.ndarray) -> None:
    """Per azimuth (360), the unit normal of the horizon-forming crest seen from the site centre, in the
    site's east/north/up axes, stored as Int8 x 3 scaled by 127."""
    assert normals.shape == (360, 3)
    write_bin(out / "ridges" / f"{sid}.bin", np.round(np.clip(normals, -1, 1) * 127), "i1")


def hillshade(dem: np.ndarray, res_m: float, exaggeration: float = 1.0) -> np.ndarray:
    """8-bit hillshade lit from the upper left at 35 deg. Lighting is illustrative, not the real Sun."""
    gy, gx = np.gradient(dem.astype(np.float64) * exaggeration, res_m)
    az, alt = np.radians(315.0), np.radians(35.0)
    # image rows run down, so "up" in the image is -row; the surface normal is (-gx, gy, 1) in (right, up, out)
    shade = (np.cos(alt) * (np.sin(az) * -gx + np.cos(az) * gy) + np.sin(alt)) / np.sqrt(
        gx * gx + gy * gy + 1.0
    )
    return np.round(np.clip(shade, 0.0, 1.0) * 255)


def globe_hillshade(radius_m: np.ndarray, exaggeration: float = 4.0) -> np.ndarray:
    """8-bit hillshade of a global equirectangular grid (row 0 = 90N, col 0 = 0E, pixel-registered),
    with the same illustrative light as `hillshade` in image axes (north up), on the sphere: the east-west
    pixel size shrinks with cos(latitude). Resampled to GLOBE_W x GLOBE_H, bilinear, wrapping in longitude."""
    h, w = radius_m.shape
    r = 1_737_400.0
    dy = r * np.pi / h
    lat = np.radians(90.0 - (np.arange(h) + 0.5) * 180.0 / h)
    # near the poles the east-west pixel shrinks to nothing; the polar map covers the south, nobody looks north
    dx = r * 2.0 * np.pi / w * np.maximum(np.cos(lat), 0.05)
    z = radius_m.astype(np.float64) * exaggeration
    gx = (np.roll(z, -1, axis=1) - np.roll(z, 1, axis=1)) / (2.0 * dx[:, None])
    gy = np.gradient(z, axis=0) / dy * -1.0  # rows run south; "up" in the image is north
    az, alt = np.radians(315.0), np.radians(35.0)
    shade = (np.cos(alt) * (np.sin(az) * -gx + np.cos(az) * gy) + np.sin(alt)) / np.sqrt(
        gx * gx + gy * gy + 1.0
    )
    return np.round(globe_resample(np.clip(shade, 0.0, 1.0) * 255.0))


def globe_resample(grid: np.ndarray) -> np.ndarray:
    """Bilinear resample of a global equirectangular grid to GLOBE_W x GLOBE_H (pixel centres to
    pixel centres), wrapping in longitude."""
    h, w = grid.shape
    shade = grid.astype(np.float64)
    sr = (np.arange(GLOBE_H) + 0.5) * h / GLOBE_H - 0.5
    sc = (np.arange(GLOBE_W) + 0.5) * w / GLOBE_W - 0.5
    r0 = np.clip(np.floor(sr).astype(int), 0, h - 2)
    fr = np.clip(sr - r0, 0.0, 1.0)[:, None]
    c0 = np.floor(sc).astype(int)
    fc = (sc - c0)[None, :]
    c0, c1 = c0 % w, (c0 + 1) % w
    top = shade[r0][:, c0] * (1 - fc) + shade[r0][:, c1] * fc
    bot = shade[r0 + 1][:, c0] * (1 - fc) + shade[r0 + 1][:, c1] * fc
    return top * (1 - fr) + bot * fr


def write_globe(out: Path, img: np.ndarray, source: str, synthetic: bool) -> None:
    """The whole-Moon hillshade and its entry in basemap.json (kept when write_basemap rewrites the file)."""
    write_png16(out / "basemaps" / "globe.png", img, depth=8)
    meta = json.loads((out / "basemap.json").read_text())
    meta["globe"] = _globe_entry(source)
    meta["synthetic"] = bool(meta.get("synthetic")) or synthetic
    write_json(out / "basemap.json", meta)


def _globe_entry(source: str) -> dict:
    return {
        "file": "basemaps/globe.png",
        "projection": "equirectangular",
        "lon0_deg": 0.0,
        "row0": "north",
        "source": source,
    }


def write_basemap(
    out: Path, pole: np.ndarray, regions: dict[str, np.ndarray], synthetic: bool
) -> None:
    """Hillshade images in stereographic x/y axes (row 0 = +y, col 0 = -x): the polar cap and one
    per region, centred on the region's site."""
    write_png16(out / "basemaps" / "pole.png", pole, depth=8)
    for sid, img in regions.items():
        write_png16(out / "basemaps" / f"{sid}.png", img, depth=8)
    old = out / "basemap.json"
    kept = json.loads(old.read_text()) if old.exists() else {}
    write_json(out / "basemap.json", {
        "synthetic": synthetic,
        "pole": {"file": "basemaps/pole.png", "half_width_m": POLE_HALF_M},
        "regions": {"half_width_m": REGION_HALF_M, "files": {s: f"basemaps/{s}.png" for s in regions}},
        # written by build_globe.py, build_context.py and build_relief.py
        **{k: kept[k] for k in ("globe", "context", "relief") if k in kept},
    })  # fmt: skip


CONTEXT_HALF_M = 32_000.0  # per-site context hillshade reach (D62)


def write_context(
    out: Path, maps: dict[str, np.ndarray], res_m: float, source: str, synthetic: bool
) -> None:
    """Per-site context hillshades (D62): 8-bit greyscale JPEG, square, same axes as the region maps
    (stereographic x/y, row 0 = +y, col 0 = -x, centred on the site), loaded when a site is flown to."""
    from PIL import Image  # only the context step needs Pillow

    for sid, img in maps.items():
        path = out / "basemaps" / "context" / f"{sid}.jpg"
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(img.astype(np.uint8), mode="L").save(path, quality=85, optimize=True)
    meta = json.loads((out / "basemap.json").read_text())
    meta["context"] = {
        "half_width_m": CONTEXT_HALF_M,
        "res_m": res_m,
        "format": "jpeg",
        "source": source,
        "files": {sid: f"basemaps/context/{sid}.jpg" for sid in maps},
    }
    meta["synthetic"] = bool(meta.get("synthetic")) or synthetic
    write_json(out / "basemap.json", meta)


RELIEF_PX = 1024  # pole and context elevation grids (D67): ~594 m and 62.5 m per pixel


RELIEF_STEP_M = (
    0.5  # relief height step: far below a 62.5 m pixel's slope noise, and half the PNG size
)


def _png16_heights(path: Path, heights_m: np.ndarray) -> dict:
    """16-bit greyscale heights in RELIEF_STEP_M steps (finer if the range needs it):
    metres = offset_m + value x scale_m (the heightmap convention), PNG filter Up."""
    assert np.isfinite(heights_m).all(), path
    lo, hi = float(heights_m.min()), float(heights_m.max())
    scale = max((hi - lo) / 65535, RELIEF_STEP_M)
    write_png16(path, np.round((heights_m - lo) / scale), up=True)
    return {"offset_m": lo, "scale_m": scale, "max_m": hi}


def write_relief(
    out: Path,
    globe_m: np.ndarray,
    pole_m: np.ndarray,
    contexts_m: dict[str, np.ndarray],
    sources: dict[str, str],
    synthetic: bool,
) -> None:
    """Elevation for the Moon view's 3D relief, real-Sun shading and Topo layer (D67): heights in metres
    above R = 1,737,400 m. The globe is equirectangular (like globe.png); the pole and context grids
    use the pole and context hillshades' stereographic axes (row 0 = +y, col 0 = -x)."""
    rel = out / "basemaps" / "relief"
    assert globe_m.shape[1] == 2 * globe_m.shape[0]
    assert pole_m.shape[0] == pole_m.shape[1]
    globe = {"file": "basemaps/relief/globe.png", "width_px": globe_m.shape[1],
             **_png16_heights(rel / "globe.png", globe_m), "source": sources["globe"]}  # fmt: skip
    pole = {"file": "basemaps/relief/pole.png", "half_width_m": POLE_HALF_M, "size_px": pole_m.shape[0],
            **_png16_heights(rel / "pole.png", pole_m), "source": sources["polar"]}  # fmt: skip
    files = {}
    for sid, h in contexts_m.items():
        assert h.shape[0] == h.shape[1]
        files[sid] = {
            "file": f"basemaps/relief/context/{sid}.png",
            **_png16_heights(rel / "context" / f"{sid}.png", h),
        }
    size = {h.shape[0] for h in contexts_m.values()}
    assert len(size) <= 1
    meta = json.loads((out / "basemap.json").read_text())
    meta["relief"] = {
        "globe": globe,
        "pole": pole,
        "context": {"half_width_m": CONTEXT_HALF_M, "size_px": size.pop() if size else 0,
                    "source": sources["polar"], "files": files},
    }  # fmt: skip
    meta["synthetic"] = bool(meta.get("synthetic")) or synthetic
    write_json(out / "basemap.json", meta)


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
