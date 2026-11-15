"""Contract shapes of the generated data files (same checks apply to real pipeline output)."""

import json
import struct
from pathlib import Path

import numpy as np
import pytest

DATA = Path(__file__).resolve().parents[2] / "web" / "public" / "data"
pytestmark = pytest.mark.skipif(
    not (DATA / "sites.json").exists(), reason="run `make data-fixtures` (or `make data`) first"
)


def load(name: str):
    return json.loads((DATA / name).read_text())


def test_ephemeris_is_float32_x7_unit_vectors():
    meta = load("ephemeris.json")
    assert meta["frame"] == "MOON_ME_DE440_ME421" and meta["step_seconds"] == 3600
    for year in meta["years"].values():
        t = np.fromfile(DATA / year["file"], "<f4").reshape(-1, 7)
        assert len(t) == year["hours"]
        assert np.allclose(np.linalg.norm(t[:, 0:3], axis=1), 1, atol=1e-5)
        assert np.allclose(np.linalg.norm(t[:, 3:6], axis=1), 1, atol=1e-5)
        assert 350_000 < t[:, 6].min() and t[:, 6].max() < 410_000


def test_orientation_is_unit_quaternions_for_every_hour():
    meta = load("ephemeris.json")
    rot = meta["orientation"]
    assert (
        rot["from"] == "ICRF"
        and rot["to"] == meta["frame"]
        and rot["fields"] == ["qw", "qx", "qy", "qz"]
    )
    assert set(rot["years"]) == set(meta["years"])
    for y, year in rot["years"].items():
        q = np.fromfile(DATA / year["file"], "<f4").reshape(-1, 4)
        assert len(q) == year["hours"] == meta["years"][y]["hours"]
        assert np.allclose(np.linalg.norm(q, axis=1), 1, atol=1e-5)


def test_stars_are_unit_vectors_with_magnitudes():
    meta = load("stars.json")
    s = np.fromfile(DATA / meta["file"], "<f4").reshape(-1, 5)
    assert len(s) == meta["count"] > 0 and meta["fields"] == ["x", "y", "z", "vmag", "b_v"]
    assert np.allclose(np.linalg.norm(s[:, :3], axis=1), 1, atol=1e-5)
    assert -2 < s[:, 3].min() and s[:, 3].max() < 9


def test_masks_slopes_and_points_line_up():
    meta = load("points.json")
    n = meta["grid"]["n"] ** 2
    regions = {p["region"] for p in meta["points"]}
    for region in regions:
        pts = [p for p in meta["points"] if p["region"] == region]
        assert [p["index"] for p in pts] == list(range(n))
        mask = np.fromfile(DATA / "masks" / f"{region}.bin", "<u2")
        assert mask.size == n * 360  # 720 bytes per point
        elev = mask * meta["mask"]["unit_deg"] - meta["mask"]["offset_deg"]
        assert -10 <= elev.min() and elev.max() < 90
        assert (DATA / "slopes" / f"{region}.bin").stat().st_size == n
        normals = np.fromfile(DATA / "ridges" / f"{region}.bin", "i1").reshape(360, 3) / 127
        assert np.allclose(np.linalg.norm(normals, axis=1), 1, atol=0.02)
    for key in ("id", "lat", "lon", "x", "y", "region", "parent_site"):
        assert key in meta["points"][0]


def test_sites_and_heightmaps():
    sites = load("sites.json")["sites"]
    assert len({s["id"] for s in sites}) == len(sites)
    for s in sites:
        for key in (
            "name",
            "lat",
            "lon",
            "coord_source",
            "approximate",
            "mission",
            "agency",
            "blurb",
            "links",
        ):
            assert key in s, (s["id"], key)
        if s["terrain"]:
            hm = s["heightmap"]
            png = (DATA / hm["file"]).read_bytes()
            w, h, depth, colour = struct.unpack(">IIBB", png[16:26])
            assert (w, h, depth, colour) == (hm["size_px"], hm["size_px"], 16, 0)
            assert hm["size_px"] in (256, 1024) and hm["source"]
            assert abs(hm["res_m"] - hm["span_m"] / hm["size_px"]) < 0.01
        else:
            assert s["heightmap"] is None


def test_constraint_schema_has_spec_defaults():
    c = {x["id"]: x for x in load("constraints.schema.json")["constraints"]}
    want = {"mission_duration_days": 7, "min_continuous_sun_days": 6, "max_continuous_dark_hours": 80,
            "min_earth_visible_pct": 40, "min_earth_elevation_deg": 1, "max_slope_deg": 10,
            "slip_range_days": 30, "search_radius_km": 5, "landing_sun_and_earth_visible": True}  # fmt: skip
    assert {k: v["default"] for k, v in c.items()} == want
    for x in c.values():
        assert set(x) == {"id", "type", "unit", "min", "max", "default"}


def test_basemaps_are_8bit_square_pngs():
    meta = load("basemap.json")
    terrain = {s["id"] for s in load("sites.json")["sites"] if s["terrain"]}
    assert set(meta["regions"]["files"]) == terrain
    assert meta["pole"]["half_width_m"] > 0 and meta["regions"]["half_width_m"] >= 5000
    for file in [meta["pole"]["file"], *meta["regions"]["files"].values()]:
        w, h, depth, colour = struct.unpack(">IIBB", (DATA / file).read_bytes()[16:26])
        assert w == h and (depth, colour) == (8, 0), file


def test_tour_has_steps_and_glossary():
    tour = load("tour.json")
    assert tour["steps"] and all(set(s) >= {"id", "title", "body"} for s in tour["steps"])
    assert tour["glossary"] and all(set(g) == {"term", "definition"} for g in tour["glossary"])
