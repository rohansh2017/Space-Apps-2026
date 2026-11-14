import numpy as np

from horizonwalk.geo import R_MOON_M as R
from horizonwalk.masks import horizon_masks

POLE = (np.array([-90.0]), np.array([0.0]))


def run(near, far, far_res=80.0):
    half_n, half_f = near.shape[0] * 10.0, far.shape[0] * far_res / 2
    return horizon_masks(*POLE, near, -half_n, half_n, 20.0, far, -half_f, half_f, far_res)


def test_flat_sphere_gives_the_2m_horizon_dip():
    elev, masks = run(np.zeros((1200, 1200), np.float32), np.zeros((7600, 7600), np.float32))
    dip = -np.degrees(np.arccos(R / (R + 2.0)))  # about -0.087 deg
    assert elev[0] == 0
    assert np.allclose(masks, dip, atol=0.002)


def test_far_ridge_angle_includes_curvature():
    # a 3 km high wall 100 km away toward azimuth 0 (lon 0 = +y), seen from the pole
    far = np.zeros((7600, 7600), np.float32)
    row = 3800 - int(100_000 / 80)
    far[row - 3 : row + 3, :] = 3000.0
    _, masks = run(np.zeros((1200, 1200), np.float32), far)
    th = 100_000 / R  # the map distance at the pole is within 0.1% of the arc length here
    expect = np.degrees(np.arctan2((R + 3000) * np.cos(th) - (R + 2), (R + 3000) * np.sin(th)))
    flat_earth = np.degrees(np.arctan2(3000 - 2, 100_000))
    assert abs(masks[0, 0] - expect) < 0.03
    assert flat_earth - masks[0, 0] > 1.5  # curvature drop d^2/(2R) = 2.9 km matters
    assert masks[0, 180] < 0  # nothing but the dip behind us


def test_near_dem_is_used_inside_10km():
    near = np.zeros((1200, 1200), np.float32)
    near[600 - 250 - 2 : 600 - 250 + 2, :] = (
        500.0  # wall 5 km toward azimuth 0, only in the near DEM
    )
    _, masks = run(near, np.zeros((7600, 7600), np.float32))
    assert abs(masks[0, 0] - np.degrees(np.arctan2(498, 5000))) < 0.15
