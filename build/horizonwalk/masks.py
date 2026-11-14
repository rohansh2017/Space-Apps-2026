"""Horizon masks: for each point and each of 360 azimuths, the highest terrain elevation angle.

Rays follow great circles on the R = 1,737.4 km sphere from 2 m above the terrain out to 300 km,
sampling the near (20 m) DEM inside 10 km and the far (80 m) DEM beyond, with steps of about
0.5% of the distance. The angle to each sample is exact spherical geometry, which is what the
curvature drop d^2/(2R) approximates. No refraction.
"""

import numpy as np
from numba import njit, prange

from horizonwalk.geo import R_MOON_M as R


@njit(cache=True)
def _height(dem, left, top, res, x, y):
    """Bilinear sample of a pixel-registered grid whose outer top-left corner is (left, top)."""
    col = (x - left) / res - 0.5
    row = (top - y) / res - 0.5
    c0 = int(np.floor(col))
    r0 = int(np.floor(row))
    if c0 < 0 or r0 < 0 or c0 + 1 >= dem.shape[1] or r0 + 1 >= dem.shape[0]:
        return np.nan
    fc = col - c0
    fr = row - r0
    top_row = dem[r0, c0] * (1 - fc) + dem[r0, c0 + 1] * fc
    bottom_row = dem[r0 + 1, c0] * (1 - fc) + dem[r0 + 1, c0 + 1] * fc
    return top_row * (1 - fr) + bottom_row * fr


@njit(cache=True)
def sample(dem, left, top, res, xs, ys):
    out = np.empty(xs.size)
    for i in range(xs.size):
        out[i] = _height(dem, left, top, res, xs[i], ys[i])
    return out


@njit(parallel=True, cache=True)
def horizon_masks(lat, lon, near, near_left, near_top, near_res, far, far_left, far_top, far_res,
                  eye_m=2.0, max_m=300_000.0, handover_m=10_000.0):  # fmt: skip
    """Return (terrain elevation m per point, mask degrees with shape (points, 360))."""
    n = lat.size
    elev = np.empty(n)
    masks = np.empty((n, 360))
    for i in prange(n):
        la, lo = np.radians(lat[i]), np.radians(lon[i])
        cl, sl, co, so = np.cos(la), np.sin(la), np.cos(lo), np.sin(lo)
        ux, uy, uz = cl * co, cl * so, sl  # up
        ex, ey = -so, co  # east (z = 0)
        nx, ny, nz = -sl * co, -sl * so, cl  # north
        h0 = _height(
            near, near_left, near_top, near_res, 2 * R * uy / (1 - uz), 2 * R * ux / (1 - uz)
        )
        elev[i] = h0
        r0 = R + h0 + eye_m
        for k in range(360):
            a = np.radians(k)
            tx = np.sin(a) * ex + np.cos(a) * nx
            ty = np.sin(a) * ey + np.cos(a) * ny
            tz = np.cos(a) * nz
            best = -np.pi / 2
            d = near_res
            while d <= max_m:
                th = d / R
                c, s = np.cos(th), np.sin(th)
                px, py, pz = c * ux + s * tx, c * uy + s * ty, c * uz + s * tz
                x, y = 2 * R * py / (1 - pz), 2 * R * px / (1 - pz)  # south polar stereographic
                h = np.nan
                if d < handover_m:
                    h = _height(near, near_left, near_top, near_res, x, y)
                if np.isnan(h):
                    h = _height(far, far_left, far_top, far_res, x, y)
                if np.isnan(h):
                    break  # ray left the DEM
                r1 = R + h
                best = max(best, np.arctan2(r1 * c - r0, r1 * s))
                d += max(near_res, 0.005 * d)
            masks[i, k] = np.degrees(best)
    return elev, masks
