"""Tests for building the qualifying target (grid order) from Q-session results."""
import numpy as np
import pandas as pd
import pytest

from src.features.qualisim import quali_target_from_results


def _td(s):
    return pd.to_timedelta(s, unit="s") if s is not None else pd.NaT


def _results(rows):
    return pd.DataFrame(
        [
            {"Abbreviation": d, "Position": pos, "Q1": _td(q1), "Q2": _td(q2), "Q3": _td(q3)}
            for d, pos, q1, q2, q3 in rows
        ]
    )


def test_pole_gap_is_best_time_minus_fastest_overall():
    res = _results(
        [
            ("VER", 1, 79.0, 78.5, 78.0),   # best 78.0 -> pole
            ("LEC", 2, 79.2, 78.7, 78.4),   # best 78.4 -> +0.4
            ("HAM", 3, 79.1, 78.9, None),   # best 78.9 -> +0.9
        ]
    )
    out = quali_target_from_results(res).set_index("Driver")
    assert out.loc["VER", "pole_gap"] == pytest.approx(0.0)
    assert out.loc["LEC", "pole_gap"] == pytest.approx(0.4)
    assert out.loc["HAM", "pole_gap"] == pytest.approx(0.9)
    assert out.loc["VER", "quali_pos"] == 1


def test_driver_with_no_lap_time_is_dropped():
    res = _results(
        [
            ("VER", 1, 78.0, None, None),
            ("DNS", 20, None, None, None),  # set no time
        ]
    )
    out = quali_target_from_results(res)
    assert out["Driver"].tolist() == ["VER"]
