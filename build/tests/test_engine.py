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


def test_run_lengths_and_window_metrics():
    frac = np.array([1, 1, 0.5, 0, 0, 0, 1, 0, 1, 1], dtype=float)
    earth = np.array([1, 0, 0, 1, 1, 1, 1, 1, 0, 0], dtype=bool)
    el = np.zeros(10)
    m = engine.window_metrics(frac, earth, el, 0, 10)
    assert (m["longest_lit_h"], m["longest_dark_h"]) == (3, 3)
    assert abs(m["sunlit_pct"] - 55.0) < 1e-9 and m["earth_pct"] == 60.0
    assert abs(m["power_index"] - 0.55) < 1e-12 and m["landing_ok"]
    m = engine.window_metrics(frac, earth, el, 3, 4)  # runs are clipped to the window
    assert (m["longest_lit_h"], m["longest_dark_h"], m["landing_ok"]) == (1, 3, False)
    assert engine.window_metrics(np.zeros(5), np.zeros(5), el, 0, 5)["mean_el_lit"] is None


def test_event_detection():
    lit = np.array([1, 1, 0, 0, 0, 1, 1], dtype=bool)
    assert engine.next_change(lit, 0) == 2  # sunset in 2 h
    assert engine.next_change(lit, 2) == 3  # sunrise in 3 h
    assert engine.next_change(lit, 5) is None  # no change inside the series


def test_evaluate_passes_and_scores():
    c = {"mission_duration_days": 7, "min_continuous_sun_days": 6, "max_continuous_dark_hours": 80,
             "min_earth_visible_pct": 40, "max_slope_deg": 10, "landing_sun_and_earth_visible": True}  # fmt: skip
    good = {"longest_lit_h": 168, "longest_dark_h": 0, "earth_pct": 60.0, "landing_ok": True}
    r = engine.evaluate(good, 5.0, c)
    assert r["fails"] == 0 and all(r["passes"].values())
    assert abs(r["score"] - (24 / 168 + 80 / 168 + 0.2 + 5 / 30)) < 1e-12
    bad = {"longest_lit_h": 100, "longest_dark_h": 90, "earth_pct": 10.0, "landing_ok": False}
    r = engine.evaluate(bad, 20.0, c)
    assert r["fails"] == 5 and r["score"] < 0
    assert (
        engine.evaluate(good, 5.0, c)["score"]
        > engine.evaluate(dict(good, earth_pct=45.0), 5.0, c)["score"]
    )
