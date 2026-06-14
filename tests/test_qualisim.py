"""Tests for quali-sim (low-fuel single-lap) pace extraction.

A quali sim is a driver's fastest clean flying lap in practice — low fuel, soft
tyre. Proxy: the fastest accurate, green, non-deleted, non-pit lap per driver.
"""
import numpy as np
import pandas as pd
import pytest

from src.features.qualisim import best_qualisim_pace, qualisim_delta


def _td(s):
    return pd.to_timedelta(s, unit="s") if s is not None else pd.NaT


def make_laps(rows):
    recs = []
    for r in rows:
        recs.append(
            {
                "Driver": r["driver"],
                "LapTime": _td(r.get("secs")),
                "PitInTime": _td(r.get("pit_in")),
                "PitOutTime": _td(r.get("pit_out")),
                "TrackStatus": r.get("status", "1"),
                "Deleted": r.get("deleted", False),
                "IsAccurate": r.get("accurate", True),
                "Compound": r.get("compound", "SOFT"),
            }
        )
    return pd.DataFrame(recs)


def test_best_qualisim_pace_takes_fastest_clean_accurate_lap():
    laps = make_laps(
        [
            {"driver": "VER", "secs": 90.0},                          # long-run lap (slow)
            {"driver": "VER", "secs": 78.0},                          # the quali sim (fast, clean)
            {"driver": "VER", "secs": 76.0, "deleted": True},         # deleted track-limits lap
            {"driver": "VER", "secs": 75.0, "status": "2"},           # yellow-flag lap
            {"driver": "VER", "secs": 70.0, "pit_out": 10.0},         # out-lap (not a flying lap)
            {"driver": "VER", "secs": 74.0, "accurate": False},       # inaccurate lap
            {"driver": "HAM", "secs": 79.0},
        ]
    )
    out = best_qualisim_pace(laps).set_index("Driver")["qsim_seconds"]
    assert out["VER"] == pytest.approx(78.0)
    assert out["HAM"] == pytest.approx(79.0)


def test_qualisim_delta_is_relative_to_session_best():
    laps = make_laps(
        [
            {"driver": "VER", "secs": 78.0},
            {"driver": "HAM", "secs": 79.2},
            {"driver": "LEC", "secs": 78.5},
        ]
    )
    out = qualisim_delta(laps).set_index("Driver")["qsim_delta"]
    assert out["VER"] == pytest.approx(0.0)    # session best
    assert out["LEC"] == pytest.approx(0.5)
    assert out["HAM"] == pytest.approx(1.2)


def test_best_qualisim_pace_ignores_driver_with_no_clean_lap():
    laps = make_laps(
        [
            {"driver": "VER", "secs": 78.0},
            {"driver": "STR", "secs": 80.0, "deleted": True},  # only lap is deleted
        ]
    )
    out = best_qualisim_pace(laps)
    assert out["Driver"].tolist() == ["VER"]
