"""Tests for stint detection and lap cleaning (spike Step 1).

Synthetic lap frames mirror the fastf1 `laps` schema closely enough to exercise
the cleaning rules: NaT lap times, deleted laps, non-green track status,
in/out laps, the 107%-of-median filter, and the >=5-lap long-run threshold.
"""
import numpy as np
import pandas as pd
import pytest

from src.features.stints import filter_green_laps, long_run_stints


def _td(seconds):
    return pd.to_timedelta(seconds, unit="s") if seconds is not None else pd.NaT


def make_laps(rows):
    """rows: list of dicts with keys driver, lap, stint, compound, secs,
    and optional pit_in, pit_out, status, deleted."""
    recs = []
    for r in rows:
        recs.append(
            {
                "Driver": r["driver"],
                "LapNumber": r["lap"],
                "Stint": r["stint"],
                "Compound": r.get("compound", "MEDIUM"),
                "LapTime": _td(r.get("secs")),
                "PitInTime": _td(r.get("pit_in")),
                "PitOutTime": _td(r.get("pit_out")),
                "TrackStatus": r.get("status", "1"),
                "Deleted": r.get("deleted", False),
                "TyreLife": r.get("lap"),
            }
        )
    return pd.DataFrame(recs)


def test_filter_drops_nat_deleted_nongreen_and_pit_laps():
    laps = make_laps(
        [
            {"driver": "VER", "lap": 1, "stint": 1, "secs": 80.0, "pit_out": 100.0},  # out-lap
            {"driver": "VER", "lap": 2, "stint": 1, "secs": 79.0},                      # keep
            {"driver": "VER", "lap": 3, "stint": 1, "secs": None},                      # NaT
            {"driver": "VER", "lap": 4, "stint": 1, "secs": 79.5, "deleted": True},     # deleted
            {"driver": "VER", "lap": 5, "stint": 1, "secs": 79.2, "status": "2"},       # yellow
            {"driver": "VER", "lap": 6, "stint": 1, "secs": 79.1, "pit_in": 500.0},     # in-lap
            {"driver": "VER", "lap": 7, "stint": 1, "secs": 79.3},                       # keep
        ]
    )
    out = filter_green_laps(laps)
    assert sorted(out["LapNumber"].tolist()) == [2, 7]


def test_long_run_requires_min_raw_stint_length():
    # 4-lap stint is below the >=5 long-run threshold -> excluded entirely
    rows = [
        {"driver": "HAM", "lap": i, "stint": 1, "secs": 90.0 + i * 0.05}
        for i in range(1, 5)
    ]
    out = long_run_stints(make_laps(rows), min_laps=5)
    assert out.empty


def test_long_run_keeps_qualifying_stint_and_adds_columns():
    rows = [
        {"driver": "HAM", "lap": i, "stint": 1, "secs": 90.0 + i * 0.05}
        for i in range(1, 8)  # 7-lap clean stint
    ]
    out = long_run_stints(make_laps(rows), min_laps=5)
    assert len(out) == 7
    assert (out["StintId"] == "HAM-1").all()
    assert "LapTimeSeconds" in out.columns
    # LapInStint is 1-based, ordered by lap number
    assert out.sort_values("LapNumber")["LapInStint"].tolist() == [1, 2, 3, 4, 5, 6, 7]


def test_long_run_drops_laps_above_107pct_of_median():
    # six normal ~90s laps + one 120s traffic lap; 120 > 1.07*median -> dropped
    rows = [
        {"driver": "LEC", "lap": i, "stint": 1, "secs": 90.0}
        for i in range(1, 7)
    ]
    rows.append({"driver": "LEC", "lap": 7, "stint": 1, "secs": 120.0})
    out = long_run_stints(make_laps(rows), min_laps=5, pct=1.07)
    assert len(out) == 6
    assert out["LapTimeSeconds"].max() < 100.0


def test_long_run_excludes_stint_with_too_few_clean_laps():
    # raw length 6 (passes >=5), but 3 laps are non-green -> only 3 clean < min_clean
    rows = [
        {"driver": "NOR", "lap": 1, "stint": 1, "secs": 90.0},
        {"driver": "NOR", "lap": 2, "stint": 1, "secs": 90.1},
        {"driver": "NOR", "lap": 3, "stint": 1, "secs": 90.2},
        {"driver": "NOR", "lap": 4, "stint": 1, "secs": 90.3, "status": "4"},
        {"driver": "NOR", "lap": 5, "stint": 1, "secs": 90.4, "status": "4"},
        {"driver": "NOR", "lap": 6, "stint": 1, "secs": 90.5, "status": "4"},
    ]
    out = long_run_stints(make_laps(rows), min_laps=5, min_clean=4)
    assert out.empty


def test_long_run_separates_stints_by_driver_and_stint_number():
    rows = []
    rows += [{"driver": "VER", "lap": i, "stint": 1, "secs": 88.0 + i * 0.05} for i in range(1, 7)]
    rows += [{"driver": "VER", "lap": i, "stint": 2, "secs": 87.0 + i * 0.05} for i in range(7, 13)]
    rows += [{"driver": "PER", "lap": i, "stint": 1, "secs": 89.0 + i * 0.05} for i in range(1, 7)]
    out = long_run_stints(make_laps(rows), min_laps=5)
    assert set(out["StintId"].unique()) == {"VER-1", "VER-2", "PER-1"}
