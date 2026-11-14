"""Python reference engine. engine.ts must match this on shared/fixtures (make parity)."""

import numpy as np

from horizonwalk.geo import site_frame

SUN_RADIUS_DEG = 0.265  # the Sun is a 0.53 deg disk
EARTH_MIN_EL_DEG = 1.0


def _az_el(v):
    e, n, u = np.moveaxis(v, -1, 0)
    return np.degrees(np.arctan2(e, n)) % 360.0, np.degrees(np.arctan2(u, np.hypot(e, n)))


def site_angles(table, lat_deg: float, lon_deg: float, elev_m: float):
    """(sun_az, sun_el, earth_az, earth_el) in degrees from ephemeris rows (N, 7).

    The Sun uses its stored direction as is (parallax < 0.001 deg). Earth is shifted by the
    site position, the finite-distance correction of up to ~0.26 deg.
    """
    table = np.asarray(table, dtype=np.float64)
    pos, enu = site_frame(lat_deg, lon_deg, elev_m)
    sun = _az_el(table[:, 0:3] @ enu.T)
    earth = _az_el((table[:, 3:6] * table[:, 6:7] - pos) @ enu.T)
    return (*sun, *earth)


def mask_at(mask_deg, az_deg):
    """Mask elevation at any azimuth: linear interpolation between the 1 deg bins, wrapping."""
    az = np.asarray(az_deg) % 360.0
    k = np.floor(az).astype(int) % 360
    f = az - np.floor(az)
    mask_deg = np.asarray(mask_deg)
    return mask_deg[k] * (1 - f) + mask_deg[(k + 1) % 360] * f


def sun_fraction(sun_el_deg, mask_el_deg):
    """Share of the solar disk above the mask (0..1), with the horizon taken as level across the disk."""
    k = np.clip((np.asarray(mask_el_deg) - sun_el_deg) / SUN_RADIUS_DEG, -1.0, 1.0)
    return 1.0 - (np.arccos(-k) + k * np.sqrt(1.0 - k * k)) / np.pi


def earth_visible(earth_el_deg, mask_el_deg, min_el_deg: float = EARTH_MIN_EL_DEG):
    return np.asarray(earth_el_deg) - mask_el_deg >= min_el_deg


def decode_mask(raw_u16):
    return np.asarray(raw_u16, dtype=np.float64) * 0.01 - 10.0


# --- Metrics over a mission window (definitions: SPEC.md, "Metric definitions") ---


def _longest_run(flags) -> int:
    """Length of the longest run of True."""
    edges = np.flatnonzero(np.diff(np.concatenate(([0], np.asarray(flags, dtype=np.int8), [0]))))
    return int((edges[1::2] - edges[::2]).max()) if edges.size else 0


def window_metrics(frac, earth, sun_el, start: int, hours: int, deck: bool = False) -> dict:
    """Metrics for the window [start, start + hours) of hourly series.

    frac: Sun visible fraction; earth: Earth-visible flags; sun_el: solar elevation in degrees.
    The power index uses cos(elevation) for a vertical mast, sin(elevation) for a horizontal deck.
    """
    f = np.asarray(frac, dtype=np.float64)[start : start + hours]
    e = np.asarray(earth, dtype=bool)[start : start + hours]
    el = np.asarray(sun_el, dtype=np.float64)[start : start + hours]
    assert f.size == hours, "window runs past the end of the series"
    lit = f > 0
    geometry = np.sin(np.radians(el)) if deck else np.cos(np.radians(el))
    return {
        "sunlit_pct": float(f.mean() * 100),
        "longest_lit_h": _longest_run(lit),
        "longest_dark_h": _longest_run(~lit),
        "earth_pct": float(e.mean() * 100),
        "power_index": float((f * geometry).mean()),
        "mean_el_lit": float(el[lit].mean()) if lit.any() else None,
        "landing_ok": bool(lit[0] and e[0]),
    }


def next_change(flags, t: int) -> int | None:
    """Hours from t until flags first differs from flags[t] (sunset, sunrise, Earthset, Earthrise)."""
    flags = np.asarray(flags, dtype=bool)
    later = np.flatnonzero(flags[t:] != flags[t])
    return int(later[0]) if later.size else None


def evaluate(m: dict, slope_deg: float, c: dict, weights: dict | None = None) -> dict:
    """Pass/fail and normalized margin per constraint, plus the weighted margin score.

    Margins are positive when a constraint passes and are clamped to [-1, 1] before weighting.
    """
    dur_h = c["mission_duration_days"] * 24
    margins = {
        "min_continuous_sun_days": (m["longest_lit_h"] - c["min_continuous_sun_days"] * 24) / dur_h,
        "max_continuous_dark_hours": (c["max_continuous_dark_hours"] - m["longest_dark_h"]) / dur_h,
        "min_earth_visible_pct": (m["earth_pct"] - c["min_earth_visible_pct"]) / 100,
        "max_slope_deg": (c["max_slope_deg"] - slope_deg) / 30,
    }
    if c["landing_sun_and_earth_visible"]:
        margins["landing_sun_and_earth_visible"] = 0.0 if m["landing_ok"] else -1.0
    weights = weights or {}
    return {
        "passes": {k: v >= 0 for k, v in margins.items()},
        "fails": sum(v < 0 for v in margins.values()),
        "score": float(
            sum(weights.get(k, 1.0) * min(1.0, max(-1.0, v)) for k, v in margins.items())
        ),
    }
