"""Site geometry in MOON_ME_DE440_ME421: local frames and the LOLA polar stereographic grid."""

import numpy as np

R_MOON_M = 1_737_400.0  # LOLA reference sphere; also the stereographic R


def site_frame(lat_deg: float, lon_deg: float, elev_m: float = 0.0):
    """Return (site position km, 3x3 rows east/north/up) on the reference sphere."""
    lat, lon = np.radians(lat_deg), np.radians(lon_deg)
    cl, sl, co, so = np.cos(lat), np.sin(lat), np.cos(lon), np.sin(lon)
    up = np.array([cl * co, cl * so, sl])
    enu = np.array([[-so, co, 0.0], [-sl * co, -sl * so, cl], up])
    return up * (R_MOON_M + elev_m) / 1000.0, enu


def az_el(body_km, lat_deg: float, lon_deg: float, elev_m: float = 0.0):
    """Topocentric azimuth (clockwise from north) and elevation, degrees.

    body_km: Moon-centred body position(s), shape (..., 3). Subtracting the site
    position is the exact parallax correction (matters for Earth, ~0.26 deg).
    """
    pos, enu = site_frame(lat_deg, lon_deg, elev_m)
    e, n, u = np.moveaxis((np.asarray(body_km) - pos) @ enu.T, -1, 0)
    return np.degrees(np.arctan2(e, n)) % 360.0, np.degrees(np.arctan2(u, np.hypot(e, n)))


def latlon_to_xy(lat_deg, lon_deg):
    """South polar stereographic, true at the pole, metres. +y is lon 0, +x is lon 90E."""
    r = 2.0 * R_MOON_M * np.tan(np.radians(90.0 + np.asarray(lat_deg)) / 2.0)
    lon = np.radians(lon_deg)
    return r * np.sin(lon), r * np.cos(lon)


def xy_to_latlon(x, y):
    lat = 2.0 * np.degrees(np.arctan(np.hypot(x, y) / (2.0 * R_MOON_M))) - 90.0
    return lat, np.degrees(np.arctan2(x, y))
