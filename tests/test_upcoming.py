"""Tests for the upcoming-weekend podium target-row builder (M5 R10)."""
import numpy as np
import pandas as pd

from src.calendar import DRY_CIRCUITS, race_id
from src.inference.upcoming import (
    build_podium_target,
    latest_entry_list,
    predict_upcoming_podium,
)


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


def test_latest_entry_list_is_the_most_recent_round_drivers():
    drivers = latest_entry_list(_season_results(), 2026)
    assert set(drivers) == {"VER", "NOR", "SAR"}


def _podium_history():
    # >= 8 prior weekends (2023 + 2024 dry set) so predict_podium isn't a warmup band;
    # VER/NOR podium, LEC/SAR not -> two label classes. Feature cols only.
    rows = []
    for year in (2023, 2024):
        for gp in DRY_CIRCUITS:
            for drv, rank, pts, podium, finish, gridpos in [
                ("VER", 1, 200, 1, 1, 1), ("NOR", 2, 150, 1, 3, 2),
                ("LEC", 5, 80, 0, 8, 5), ("SAR", 18, 0, 0, 16, 18),
            ]:
                rows.append({
                    "race_id": race_id(year, gp), "year": year, "gp": gp, "Driver": drv,
                    "champ_rank_before": rank, "champ_points_before": pts,
                    "form_finish_avg3": finish, "prior_track_pace": -0.1 if podium else 0.2,
                    "grid_position": gridpos, "podium": podium, "finish_pos": finish,
                })
    return pd.DataFrame(rows)


def test_predict_upcoming_podium_future_weekend_is_not_qualitative():
    out = predict_upcoming_podium(
        _podium_history(), _season_results(), _pace_hist(), 2026, "Austria",
        entry_drivers=["VER", "NOR", "SAR"],
    )
    # The future-weekend gap is fixed: a real ranked podium, not the empty-target band.
    assert out["qualitative"] is True  # bands are the product surface (calibrated:false)
    assert out["calibrated"] is False
    assert out["mode"] == "friday"  # no grid -> pre-quali
    assert [d["driver"] for d in out["drivers"][:1]] == ["VER"]
    assert all("band" in d for d in out["drivers"])


def test_predict_upcoming_podium_sharpens_to_saturday_with_grid():
    out = predict_upcoming_podium(
        _podium_history(), _season_results(), _pace_hist(), 2026, "Austria",
        entry_drivers=["VER", "NOR", "SAR"], grid={"VER": 1, "NOR": 2, "SAR": 3},
    )
    assert out["mode"] == "saturday"


def test_predict_upcoming_podium_ignores_leaked_target_rows_in_history():
    # A stale/leaked row for the TARGET weekend already in the history table (e.g. fastf1
    # leaking future-race data) must NOT duplicate drivers or inject null-team rows. The
    # freshly-built target (which carries team) is the only valid representation of this gp.
    leaked = pd.DataFrame([{
        "race_id": race_id(2026, "Austria"), "year": 2026, "gp": "Austria", "Driver": "VER",
        "champ_rank_before": 1, "champ_points_before": 50, "form_finish_avg3": 1,
        "prior_track_pace": -0.1, "grid_position": 1, "podium": 1, "finish_pos": 1,
        "team": None,
    }])
    hist = pd.concat([_podium_history(), leaked], ignore_index=True)
    out = predict_upcoming_podium(
        hist, _season_results(), _pace_hist(), 2026, "Austria",
        entry_drivers=["VER", "NOR", "SAR"],
    )
    codes = [d["driver"] for d in out["drivers"]]
    assert len(codes) == len(set(codes)) == 3  # no duplicated VER from the leaked row
    assert all(d.get("team") is not None for d in out["drivers"])  # no null-team leak
