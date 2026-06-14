"""Tests for the batch build pipeline (M1).

No fastf1 here: we exercise the pure assembly/persistence seam by monkeypatching
the session-extraction helper, so the test is fast and cache-free.
"""
import pandas as pd

import src.pipeline as pipeline
from src import store


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

    pipeline.build_all()

    pd.testing.assert_frame_equal(store.read_table(pace_path), pace)
    pd.testing.assert_frame_equal(store.read_table(strat_path), strat)
