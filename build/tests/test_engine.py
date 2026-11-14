import numpy as np

from horizonwalk import engine


def test_mask_interpolates_and_wraps():
    mask = np.zeros(360)
    mask[10], mask[11], mask[359], mask[0] = 2.0, 4.0, 1.0, 3.0
    assert engine.mask_at(mask, 10.25) == 2.5
    assert engine.mask_at(mask, 359.5) == 2.0
    assert engine.mask_at(mask, -0.5) == 2.0


def test_partial_solar_disk():
    f = engine.sun_fraction
    assert f(1.0, 0.0) == 1.0 and f(-1.0, 0.0) == 0.0
    assert abs(f(0.0, 0.0) - 0.5) < 1e-12
    assert f(0.265, 0.0) == 1.0 and f(-0.265, 0.0) == 0.0  # disk just clear / just hidden
    assert 0.5 < f(0.1, 0.0) < 1.0
    assert abs(f(0.1, 0.0) + f(-0.1, 0.0) - 1.0) < 1e-12


def test_earth_needs_one_degree_clearance():
    assert engine.earth_visible(3.0, 2.0) and not engine.earth_visible(2.99, 2.0)


def test_site_angles_apply_earth_parallax_only():
    # Sun and Earth both along +z, seen from lat 0 lon 0 where +z is the north horizon
    row = np.array([[0, 0, 1, 0, 0, 1, 384_400.0]])
    _, sun_el, earth_az, earth_el = engine.site_angles(row, 0.0, 0.0, 0.0)
    assert abs(sun_el[0]) < 1e-9
    assert -0.27 < earth_el[0] < -0.25
    assert abs(earth_az[0]) < 1e-9 or abs(earth_az[0] - 360) < 1e-9
