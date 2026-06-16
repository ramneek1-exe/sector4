"""Tests for Friday-information-state features (standings, form, track history).

The whole point is leakage discipline: every feature is computed strictly from
races PRIOR IN TIME to the race being predicted.
"""
import numpy as np
import pandas as pd
import pytest

from src.features.friday import (
    standings_before,
    constructor_standings_before,
    rank_from_points,
    trailing_finish_avg,
    track_history_finish,
    add_friday_features,
    prior_track_pace,
)


def _results():
    return pd.DataFrame(
        [
            # date, year, round, gp(event), Driver, finish_pos, points, team
            ("2023-03-01", 2023, 1, "A GP", "VER", 1, 25.0, "RBR"),
            ("2023-03-01", 2023, 1, "A GP", "HAM", 2, 18.0, "MER"),
            ("2023-03-15", 2023, 2, "B GP", "VER", 2, 18.0, "RBR"),
            ("2023-03-15", 2023, 2, "B GP", "HAM", 1, 25.0, "MER"),
            ("2023-04-01", 2023, 3, "A GP", "VER", 1, 25.0, "RBR"),
            ("2023-04-01", 2023, 3, "A GP", "HAM", 3, 15.0, "MER"),
        ],
        columns=["date", "year", "round", "gp", "Driver", "finish_pos", "points", "team"],
    ).assign(date=lambda d: pd.to_datetime(d["date"]))


def test_constructor_standings_sum_by_team_prior_only():
    cons = constructor_standings_before(_results(), 2023, pd.Timestamp("2023-04-15"))
    assert cons["RBR"] == pytest.approx(68.0)  # 25+18+25
    assert cons["MER"] == pytest.approx(58.0)  # 18+25+15


def test_standings_sum_only_prior_same_season():
    pts = standings_before(_results(), 2023, pd.Timestamp("2023-04-15"))
    assert pts["VER"] == pytest.approx(68.0)  # 25+18+25
    assert pts["HAM"] == pytest.approx(58.0)  # 18+25+15


def test_standings_exclude_target_and_future():
    # before R3's date -> only R1 + R2 count
    pts = standings_before(_results(), 2023, pd.Timestamp("2023-04-01"))
    assert pts["VER"] == pytest.approx(43.0)  # 25+18
    assert pts["HAM"] == pytest.approx(43.0)


def test_rank_from_points_leader_is_rank_one():
    ranks = rank_from_points({"VER": 68.0, "HAM": 58.0, "LEC": 70.0})
    assert ranks["LEC"] == 1
    assert ranks["VER"] == 2
    assert ranks["HAM"] == 3


def test_trailing_finish_avg_uses_last_n_prior_races():
    res = _results()
    # before 2023-04-15: VER finishes were [1(R1), 2(R2), 1(R3)] -> last 3 avg = 4/3
    assert trailing_finish_avg(res, "VER", pd.Timestamp("2023-04-15"), n=3) == pytest.approx(4 / 3)
    # last 2 -> R2(2), R3(1) -> 1.5
    assert trailing_finish_avg(res, "VER", pd.Timestamp("2023-04-15"), n=2) == pytest.approx(1.5)


def test_trailing_finish_avg_nan_when_no_prior_races():
    assert np.isnan(trailing_finish_avg(_results(), "VER", pd.Timestamp("2023-01-01"), n=3))


def test_track_history_only_same_circuit_prior():
    res = _results()
    # "A GP" before 2023-04-15: VER finished 1 (R1) and 1 (R3) -> 1.0
    assert track_history_finish(res, "A GP", "VER", pd.Timestamp("2023-04-15")) == pytest.approx(1.0)
    # before R3's date: only R1 counts
    assert track_history_finish(res, "A GP", "HAM", pd.Timestamp("2023-04-01")) == pytest.approx(2.0)


def test_add_friday_features_attaches_columns_without_leakage():
    # Realistic: one race per circuit per year. Predict 2024 "A GP".
    res = pd.DataFrame(
        [
            ("2023-04-01", 2023, 5, "A GP", "VER", 1, 25.0),   # prior-year track history
            ("2024-03-01", 2024, 1, "B GP", "VER", 1, 25.0),
            ("2024-03-01", 2024, 1, "B GP", "HAM", 2, 18.0),
            ("2024-03-15", 2024, 2, "C GP", "VER", 2, 18.0),
            ("2024-03-15", 2024, 2, "C GP", "HAM", 1, 25.0),
            ("2024-04-01", 2024, 3, "A GP", "VER", 1, 25.0),   # <-- target race (excluded)
            ("2024-04-01", 2024, 3, "A GP", "HAM", 5, 10.0),
        ],
        columns=["date", "year", "round", "gp", "Driver", "finish_pos", "points"],
    ).assign(date=lambda d: pd.to_datetime(d["date"]))
    feat = pd.DataFrame({"year": [2024], "gp": ["A"], "Driver": ["VER"]})
    out = add_friday_features(feat, res, gp_to_event={"A": "A GP"})
    row = out.iloc[0]
    # standings before 2024-04-01: VER = 25(B) + 18(C) = 43 (target race excluded)
    assert row["champ_points_before"] == pytest.approx(43.0)
    # form: last 3 prior VER finishes = 2023 A(1), 2024 B(1), 2024 C(2) -> 4/3
    assert row["form_finish_avg3"] == pytest.approx(4 / 3)
    # track history at "A GP" prior to 2024-04-01: only 2023 A(1) -> 1.0
    assert row["track_hist_finish"] == pytest.approx(1.0)


def _pace_df():
    return pd.DataFrame([
        {"gp": "Spain", "Driver": "VER", "year": 2023, "race_pace_delta": 0.10},
        {"gp": "Spain", "Driver": "VER", "year": 2024, "race_pace_delta": 0.30},
        {"gp": "Spain", "Driver": "VER", "year": 2025, "race_pace_delta": 0.99},
        {"gp": "Spain", "Driver": "HAM", "year": 2024, "race_pace_delta": 0.50},
    ])


def test_prior_track_pace_averages_strictly_prior_years():
    # 2025 sees 2023+2024 only (mean of 0.10, 0.30) -> 0.20; never the 2025 row.
    assert prior_track_pace(_pace_df(), "Spain", "VER", 2025) == 0.20


def test_prior_track_pace_nan_when_no_prior_year():
    # HAM's first Spain is 2024 -> no strictly-prior year -> NaN.
    assert np.isnan(prior_track_pace(_pace_df(), "Spain", "HAM", 2024))
