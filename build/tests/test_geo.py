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


def test_quaternion_round_trip_including_half_turns():
    from horizonwalk.geo import matrix_to_quaternion, quaternion_to_matrix

    rng = np.random.default_rng(1)
    q = rng.normal(size=(200, 4))
    q /= np.linalg.norm(q, axis=1, keepdims=True)
    q[:3] = [[0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]]  # 180 deg turns: w = 0
    m = quaternion_to_matrix(q)
    assert np.allclose(m @ np.swapaxes(m, -1, -2), np.eye(3), atol=1e-12)
    back = matrix_to_quaternion(m)
    assert np.allclose(np.abs(np.sum(back * q, axis=1)), 1, atol=1e-12)  # same rotation (q and -q)
    assert np.allclose(quaternion_to_matrix(back), m, atol=1e-12)


def test_bsc5_line_parser_reads_sirius():
    from horizonwalk.stars import parse_line

    sirius = ("2491  9Alp CMaBD-16 1591  48915151881 257I   5423           064044.6-163444064508.9-164258227.22-08.88-1.46"
              "   0.00 -0.05 -0.03   A1Vm               -0.553-1.205 +.375-008SBO    13 10.3  11.2AB   4*")  # fmt: skip
    x, y, z, vmag, bv = parse_line(sirius)
    ra = np.degrees(np.arctan2(y, x)) % 360
    dec = np.degrees(np.arcsin(z))
    assert abs(ra - (6 + 45 / 60 + 8.9 / 3600) * 15) < 1e-9
    assert abs(dec - -(16 + 42 / 60 + 58 / 3600)) < 1e-9
    assert (vmag, bv) == (-1.46, 0.0)
    assert parse_line(" 182" + " " * 190) is None  # retired entries have no position
