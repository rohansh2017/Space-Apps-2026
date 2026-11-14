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


def matrix_to_quaternion(m):
    """Rotation matrices (..., 3, 3) to unit quaternions (..., 4) as (w, x, y, z), w >= 0.

    Shepperd's method: pick the largest of w, x, y, z to divide by, so no case loses precision.
    """
    m = np.asarray(m, dtype=np.float64)
    tr = m[..., 0, 0] + m[..., 1, 1] + m[..., 2, 2]
    cand = np.stack([tr, m[..., 0, 0], m[..., 1, 1], m[..., 2, 2]], -1)
    k = np.argmax(cand, -1)
    q = np.empty(m.shape[:-2] + (4,))
    s = 2.0 * np.sqrt(
        np.maximum(1.0 + 2.0 * np.take_along_axis(cand, k[..., None], -1)[..., 0] - tr, 1e-300)
    )
    # s = 2 * |largest component|; the other three follow from the off-diagonal sums and differences
    d = {
        0: (s / 4, (m[..., 2, 1] - m[..., 1, 2]) / s, (m[..., 0, 2] - m[..., 2, 0]) / s, (m[..., 1, 0] - m[..., 0, 1]) / s),
        1: ((m[..., 2, 1] - m[..., 1, 2]) / s, s / 4, (m[..., 0, 1] + m[..., 1, 0]) / s, (m[..., 0, 2] + m[..., 2, 0]) / s),
        2: ((m[..., 0, 2] - m[..., 2, 0]) / s, (m[..., 0, 1] + m[..., 1, 0]) / s, s / 4, (m[..., 1, 2] + m[..., 2, 1]) / s),
        3: ((m[..., 1, 0] - m[..., 0, 1]) / s, (m[..., 0, 2] + m[..., 2, 0]) / s, (m[..., 1, 2] + m[..., 2, 1]) / s, s / 4),
    }  # fmt: skip
    for case, comps in d.items():
        sel = k == case
        q[sel] = np.stack([c[sel] for c in comps], -1)
    q *= np.where(q[..., :1] < 0, -1.0, 1.0)
    return q / np.linalg.norm(q, axis=-1, keepdims=True)


def quaternion_to_matrix(q):
    """Unit quaternions (..., 4) as (w, x, y, z) to rotation matrices (..., 3, 3)."""
    w, x, y, z = np.moveaxis(np.asarray(q, dtype=np.float64), -1, 0)
    return np.stack([
        np.stack([1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)], -1),
        np.stack([2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)], -1),
        np.stack([2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)], -1),
    ], -2)  # fmt: skip
