"""Sun and Earth directions from the Moon's centre in MOON_ME_DE440_ME421 (Skyfield, offline)."""

from functools import cache
from pathlib import Path

from skyfield.api import PlanetaryConstants, load, load_file

RAW = Path(__file__).resolve().parents[2] / "data" / "raw"
FRAME = "MOON_ME_DE440_ME421"


@cache
def _kernels():
    eph = load_file(str(RAW / "de440s.bsp"))
    pc = PlanetaryConstants()
    with open(RAW / "moon_de440_220930.tf", "rb") as f:
        pc.read_text(f)
    pc.read_binary(open(RAW / "moon_pa_de440_200625.bpc", "rb"))  # noqa: SIM115 (read lazily; must stay open)
    # Skyfield keeps only the last segment per body; this kernel has two (1549-2426, 2426-2650).
    for seg in pc._segment_list:
        if seg.initial_jd < 2461041.5 and seg.final_jd > 2464694.5:  # 2026-01-01 .. 2036-01-01
            pc._segment_map[seg.body] = seg
    return eph, pc.build_frame_named(FRAME), load.timescale()


def directions(t):
    """Apparent Sun and Earth positions (km, shape (3,) or (3, N)) in FRAME at Skyfield time t."""
    eph, frame, _ = _kernels()
    moon = eph["moon"].at(t)
    return tuple(moon.observe(eph[b]).apparent().frame_xyz(frame).km for b in ("sun", "earth"))


def timescale():
    return _kernels()[2]


def year_table(year: int):
    """Hourly rows for one calendar year: Sun unit vector, Earth unit vector, Earth distance km."""
    import numpy as np

    ts = timescale()
    hours = round((ts.utc(year + 1, 1, 1) - ts.utc(year, 1, 1)) * 24)
    sun, earth = directions(ts.utc(year, 1, 1, np.arange(hours)))
    dist = np.linalg.norm(earth, axis=0)
    return np.vstack([sun / np.linalg.norm(sun, axis=0), earth / dist, dist]).T


def year_orientation(year: int):
    """Hourly ICRF -> FRAME rotation for one calendar year as unit quaternions (hours, 4), (w, x, y, z).

    Stars are fixed in ICRF; this turns them with the Moon. Same hours as `year_table`.
    """
    import numpy as np

    from horizonwalk.geo import matrix_to_quaternion

    _, frame, ts = _kernels()
    hours = round((ts.utc(year + 1, 1, 1) - ts.utc(year, 1, 1)) * 24)
    rot = frame.rotation_at(
        ts.utc(year, 1, 1, np.arange(hours))
    )  # (3, 3, hours): frame_xyz = R @ icrf
    return matrix_to_quaternion(np.moveaxis(rot, -1, 0))


def sun_icrf(t):
    """Apparent Sun direction from the Moon's centre in ICRF axes (unit vectors, (3,) or (3, N))."""
    import numpy as np

    eph, _, _ = _kernels()
    v = eph["moon"].at(t).observe(eph["sun"]).apparent().position.au
    return v / np.linalg.norm(v, axis=0)
