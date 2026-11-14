import numpy as np

from horizonwalk.geo import R_MOON_M, az_el, latlon_to_xy, xy_to_latlon


def test_stereographic_round_trip_under_1cm():
    lat = np.array([-90.0, -89.9, -88.8, -84.78, -80.0])
    lon = np.array([0.0, 45.0, 123.4, 29.13, -170.0])
    x, y = latlon_to_xy(lat, lon)
    lat2, lon2 = xy_to_latlon(x, y)
    x2, y2 = latlon_to_xy(lat2, lon2)
    assert np.max(np.hypot(x2 - x, y2 - y)) < 0.01


def test_stereographic_known_points():
    assert np.allclose(latlon_to_xy(-90.0, 0.0), (0.0, 0.0), atol=1e-6)
    x, y = latlon_to_xy(-80.0, 90.0)  # lon 90E lies on +x
    assert abs(y) < 1e-6 and abs(x - 2 * R_MOON_M * np.tan(np.radians(5.0))) < 1e-6


def test_az_el_local_frame():
    far = 1e9
    # at lat 0 lon 0: +x is zenith, +z is north horizon, +y is east horizon
    assert az_el([far, 0, 0], 0, 0)[1] > 89.9
    az, el = az_el([0, 0, far], 0, 0)
    assert abs(az) < 0.01 or abs(az - 360) < 0.01
    assert abs(el) < 0.01
    assert abs(az_el([0, far, 0], 0, 0)[0] - 90) < 0.01


def test_earth_parallax_is_about_a_quarter_degree():
    # body on the site's horizon plane direction, at Earth's distance: finite distance lowers it
    el = az_el([0, 0, 384_400.0], 0, 0)[1]
    assert -0.27 < el < -0.25
