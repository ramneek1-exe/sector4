"""Tests for the batch build pipeline (M1).

No fastf1 here: we exercise the pure assembly/persistence seam by monkeypatching
the session-extraction helper, so the test is fast and cache-free.
"""
import numpy as np
import pandas as pd

import src.pipeline as pipeline
from src import store
from src.pipeline import build_podium_table


def test_build_all_writes_both_tables(tmp_path, monkeypatch):
    pace = pd.DataFrame({"race_id": ["2023-Bahrain"], "Driver": ["VER"],
                         "race_pace_delta": [0.0], "fp_pace_delta": [0.0],
                         "fp_deg_slope": [0.05], "length_km": [5.4], "n_corners": [15],
                         "abrasiveness": [5], "pit_loss_s": [23.0]})
    strat = pd.DataFrame({"race_id": ["2023-Bahrain"], "Driver": ["VER"], "n_stops": [2]})
    monkeypatch.setattr(pipeline, "build_pace_table", lambda *a, **k: pace)
    monkeypatch.setattr(pipeline, "build_strategy_table", lambda *a, **k: strat)
    pace_path = str(tmp_path / "pace.parquet")
    strat_path = str(tmp_path / "strat.parquet")
    monkeypatch.setattr(store, "PACE_TABLE", pace_path)
    monkeypatch.setattr(store, "STRATEGY_TABLE", strat_path)
    # Redirect the team-map read/write to tmp so build_all has no repo side effects.
    results = pd.DataFrame({"year": [2023], "gp": ["Bahrain Grand Prix"],
                            "Driver": ["VER"], "team": ["Red Bull Racing"]})
    results_path = str(tmp_path / "results.parquet")
    store.write_table(results, results_path)
    monkeypatch.setattr(store, "SEASON_RESULTS", results_path)
    team_path = str(tmp_path / "team.parquet")
    monkeypatch.setattr(store, "TEAM_MAP", team_path)

    pipeline.build_all()

    pd.testing.assert_frame_equal(store.read_table(pace_path), pace)
    pd.testing.assert_frame_equal(store.read_table(strat_path), strat)
    assert store.read_table(team_path)["team"].tolist() == ["Red Bull Racing"]


def test_build_team_map_keys_on_short_gp():
    from src.pipeline import build_team_map
    results = pd.DataFrame({
        "Driver": ["VER", "NOR"],
        "team": ["Red Bull Racing", "McLaren"],
        "year": [2024, 2024],
        "gp": ["Italian Grand Prix", "Italian Grand Prix"],
    })
    tm = build_team_map(results)
    assert list(tm.columns) == ["year", "gp", "Driver", "team"]
    assert set(tm["gp"]) == {"Italy"}  # EventName -> short key
    # an event outside GP_TO_EVENT is dropped
    other = pd.DataFrame({"Driver": ["VER"], "team": ["Red Bull Racing"],
                          "year": [2024], "gp": ["Japanese Grand Prix"]})
    assert build_team_map(other).empty


def _pace_df():
    # Two circuits x two years, 3 drivers. race_pace_delta lower = faster.
    rows = []
    for year in (2023, 2024):
        for gp in ("Spain", "Italy"):
            for i, drv in enumerate(["VER", "HAM", "NOR"]):
                rows.append({
                    "race_id": f"{year}-{gp}", "year": year, "gp": gp, "Driver": drv,
                    "race_pace_delta": 0.1 * i, "grid_position": i + 1,
                    "finish_pos": i + 1,
                })
    return pd.DataFrame(rows)


def _results():
    # Minimal results: one row per (year, event, driver) with date/points/finish.
    events = {"Spain": "Spanish Grand Prix", "Italy": "Italian Grand Prix"}
    rows = []
    for year in (2023, 2024):
        for gp, event in events.items():
            for i, drv in enumerate(["VER", "HAM", "NOR"]):
                rows.append({
                    "year": year, "round": 1 if gp == "Spain" else 2, "gp": event,
                    "date": pd.Timestamp(f"{year}-0{4 if gp=='Spain' else 9}-01"),
                    "Driver": drv, "finish_pos": i + 1, "points": 25 - 7 * i,
                    "team": "T",
                })
    return pd.DataFrame(rows)


def test_build_podium_table_has_features_and_label():
    t = build_podium_table(_pace_df(), _results())
    needed = {"race_id", "year", "gp", "Driver", "podium",
              "champ_points_before", "champ_rank_before", "form_finish_avg3",
              "prior_track_pace", "grid_position"}
    assert needed.issubset(t.columns)
    # podium label = finish_pos <= 3 (all 3 drivers podium here)
    assert set(t["podium"].unique()) == {1}
    # no NaNs left in the imputed feature columns
    for col in ["champ_points_before", "champ_rank_before", "form_finish_avg3", "prior_track_pace"]:
        assert not t[col].isna().any()


def test_build_podium_table_prior_track_pace_is_leakage_safe():
    t = build_podium_table(_pace_df(), _results())
    # 2023 rows have no prior year at the circuit -> imputed 0.0
    y23 = t[t["year"] == 2023]
    assert (y23["prior_track_pace"] == 0.0).all()
    # 2024-Spain VER sees only 2023-Spain VER (race_pace_delta 0.0) -> 0.0
    row = t[(t["race_id"] == "2024-Spain") & (t["Driver"] == "VER")].iloc[0]
    assert row["prior_track_pace"] == 0.0


def test_build_podium_table_includes_year_correct_team():
    t = build_podium_table(_pace_df(), _results())
    assert "team" in t.columns
    # _results() puts every driver on team "T"
    assert set(t["team"].dropna().unique()) == {"T"}
