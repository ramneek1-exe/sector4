"""Tests for the upcoming-weekend podium target-row builder (M5 R10)."""
import numpy as np
import pandas as pd

from src.calendar import race_id
from src.inference.upcoming import build_podium_target


def _season_results():
    # Two completed 2026 rounds; VER leads on points, NOR second, SAR pointless.
    rows = [
        # round 1
        ("VER", 1, 25, "Australian Grand Prix", "2026-03-08", "Red Bull Racing"),
        ("NOR", 2, 18, "Australian Grand Prix", "2026-03-08", "McLaren"),
        ("SAR", 15, 0, "Australian Grand Prix", "2026-03-08", "Williams"),
        # round 2
        ("VER", 1, 25, "Chinese Grand Prix", "2026-03-22", "Red Bull Racing"),
        ("NOR", 3, 15, "Chinese Grand Prix", "2026-03-22", "McLaren"),
        ("SAR", 12, 0, "Chinese Grand Prix", "2026-03-22", "Williams"),
    ]
    return pd.DataFrame(
        [{"Driver": d, "finish_pos": f, "points": p, "gp": e,
          "date": pd.Timestamp(dt), "team": t, "year": 2026}
         for d, f, p, e, dt, t in rows]
    )


def _pace_hist():
    # VER fast at Austria historically; NOR average; SAR no prior Austria.
    return pd.DataFrame([
        {"gp": "Austria", "Driver": "VER", "year": 2025, "race_pace_delta": -0.30},
        {"gp": "Austria", "Driver": "VER", "year": 2024, "race_pace_delta": -0.20},
        {"gp": "Austria", "Driver": "NOR", "year": 2025, "race_pace_delta": 0.05},
    ])


def test_builds_one_row_per_entry_driver_with_friday_features():
    df = build_podium_target(_season_results(), _pace_hist(), 2026, "Austria",
                             entry_drivers=["VER", "NOR", "SAR"])
    assert len(df) == 3
    assert set(df["race_id"]) == {race_id(2026, "Austria")}
    # standings: VER (50) outranks NOR (33) outranks SAR (0 -> imputed mid-grid rank)
    by_drv = df.set_index("Driver")
    assert by_drv.loc["VER", "champ_points_before"] == 50.0
    assert by_drv.loc["NOR", "champ_points_before"] == 33.0
    assert by_drv.loc["VER", "champ_rank_before"] < by_drv.loc["NOR", "champ_rank_before"]
    # prior_track_pace pulled from history (VER mean of -0.30,-0.20 = -0.25)
    assert by_drv.loc["VER", "prior_track_pace"] == -0.25
    # SAR has no Austria history -> imputed neutral 0.0
    assert by_drv.loc["SAR", "prior_track_pace"] == 0.0
    # team attached from results
    assert by_drv.loc["VER", "team"] == "Red Bull Racing"


def test_pre_quali_grid_is_nan_post_quali_filled():
    pre = build_podium_target(_season_results(), _pace_hist(), 2026, "Austria",
                              entry_drivers=["VER", "NOR"])
    assert pre["grid_position"].isna().all()  # Friday mode -> no grid
    post = build_podium_target(_season_results(), _pace_hist(), 2026, "Austria",
                               entry_drivers=["VER", "NOR"], grid={"VER": 2, "NOR": 1})
    assert post.set_index("Driver").loc["NOR", "grid_position"] == 1
    assert post["grid_position"].notna().all()  # Saturday mode


def test_no_history_driver_gets_imputed_features_not_nan():
    df = build_podium_target(_season_results(), _pace_hist(), 2026, "Austria",
                             entry_drivers=["NEW"])
    row = df.iloc[0]
    for col in ("champ_points_before", "champ_rank_before", "form_finish_avg3",
                "prior_track_pace"):
        assert not pd.isna(row[col])
