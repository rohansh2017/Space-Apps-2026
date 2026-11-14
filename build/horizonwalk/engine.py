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
