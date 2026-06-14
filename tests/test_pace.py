"""Tests for per-stint pace modelling and corrections (spike Steps 2-3)."""
import numpy as np
import pandas as pd
import pytest

from src.features.pace import (
    fit_stint_pace,
    summarize_stints,
    compute_compound_offsets,
    normalize_compound,
    session_evolution_slope,
    evolution_adjust,
)


def test_fit_stint_pace_recovers_slope_and_intercept():
    lap_in_stint = np.array([1, 2, 3, 4, 5])
    lap_seconds = 90.0 + 0.1 * lap_in_stint  # slope 0.1, intercept 90.0
    slope, intercept = fit_stint_pace(lap_in_stint, lap_seconds)
    assert slope == pytest.approx(0.1)
    assert intercept == pytest.approx(90.0)


def test_fit_stint_pace_robust_resists_single_outlier_lap():
    # clean stint with a true slope of 0.05, plus one traffic lap +5s.
    x = np.array([1, 2, 3, 4, 5, 6, 7, 8])
    y = 90.0 + 0.05 * x
    y[4] = y[4] + 5.0  # outlier the 107% filter might miss in a long stint
    ols_slope, _ = fit_stint_pace(x, y, robust=False)
    rob_slope, _ = fit_stint_pace(x, y, robust=True)
    # robust slope stays near the truth; OLS is dragged off by the outlier
    assert rob_slope == pytest.approx(0.05, abs=0.02)
    assert abs(ols_slope - 0.05) > abs(rob_slope - 0.05)


def test_summarize_stints_one_row_per_stint():
    laps = pd.DataFrame(
        {
            "StintId": ["A-1"] * 5 + ["A-2"] * 5,
            "Driver": ["A"] * 10,
            "Compound": ["SOFT"] * 5 + ["HARD"] * 5,
            "LapInStint": list(range(1, 6)) * 2,
            "LapTimeSeconds": list(90.0 + 0.1 * np.arange(1, 6))
            + list(91.0 + 0.05 * np.arange(1, 6)),
        }
    )
    out = summarize_stints(laps)
    assert set(out["StintId"]) == {"A-1", "A-2"}
    a1 = out[out["StintId"] == "A-1"].iloc[0]
    assert a1["slope"] == pytest.approx(0.1)
    assert a1["n_laps"] == 5
    assert a1["compound"] == "SOFT"


def test_compute_compound_offsets_relative_to_reference():
    summary = pd.DataFrame(
        {
            "compound": ["SOFT", "MEDIUM", "HARD"],
            "median_pace": [89.0, 90.0, 91.5],
        }
    )
    offsets = compute_compound_offsets(summary, reference="MEDIUM")
    assert offsets["MEDIUM"] == pytest.approx(0.0)
    assert offsets["SOFT"] == pytest.approx(1.0)    # soft is 1s faster -> add 1.0
    assert offsets["HARD"] == pytest.approx(-1.5)   # hard is 1.5s slower -> subtract


def test_normalize_compound_brings_paces_to_reference():
    summary = pd.DataFrame(
        {
            "StintId": ["S", "M", "H"],
            "compound": ["SOFT", "MEDIUM", "HARD"],
            "median_pace": [89.0, 90.0, 91.5],
        }
    )
    offsets = {"SOFT": 1.0, "MEDIUM": 0.0, "HARD": -1.5}
    out = normalize_compound(summary, offsets)
    assert out["pace_compound_norm"].tolist() == pytest.approx([90.0, 90.0, 90.0])


def test_session_evolution_slope_recovers_trend():
    times = np.array([0.0, 10.0, 20.0, 30.0])
    paces = 90.3 - 0.01 * times  # track speeds up: negative slope
    assert session_evolution_slope(times, paces) == pytest.approx(-0.01)


def test_evolution_adjust_removes_track_ramp():
    times = np.array([0.0, 10.0, 20.0, 30.0])
    paces = 90.3 - 0.01 * times
    slope = -0.01
    adjusted = evolution_adjust(paces, times, slope, t_ref=15.0)
    # all stints normalised to the same track state -> constant
    assert adjusted == pytest.approx([90.15] * 4)
