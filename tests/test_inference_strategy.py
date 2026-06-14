"""Tests for predict_stop_counts (Model B inference, M1)."""
import pandas as pd

from src.inference.strategy import SC_CAVEAT, predict_stop_counts


def _strategy_table():
    rows = []
    # prior 2023 weekends: high-deg -> 2 stops, low-deg -> 1 stop
    for gp, deg, stops in [("Bahrain", 0.25, 2), ("Saudi Arabia", 0.05, 1),
                           ("Spain", 0.22, 2), ("Hungary", 0.06, 1)]:
        for d in ["VER", "HAM", "LEC", "NOR"]:
            rows.append({"race_id": f"2023-{gp}", "gp": gp, "Driver": d, "n_stops": stops,
                         "pit_loss_s": 21.0, "abrasiveness": 3, "track_temp": 35.0,
                         "hist_modal_stops": stops, "deg_overall": deg,
                         "deg_SOFT": deg, "deg_MEDIUM": deg, "deg_HARD": deg,
                         "feas_max_stint": 20})
    # target 2024-Bahrain (high deg)
    for d in ["VER", "HAM", "LEC", "NOR"]:
        rows.append({"race_id": "2024-Bahrain", "gp": "Bahrain", "Driver": d, "n_stops": 2,
                     "pit_loss_s": 23.0, "abrasiveness": 5, "track_temp": 36.0,
                     "hist_modal_stops": 2, "deg_overall": 0.24,
                     "deg_SOFT": 0.24, "deg_MEDIUM": 0.24, "deg_HARD": 0.24,
                     "feas_max_stint": 18})
    return pd.DataFrame(rows)


def test_predict_stop_counts_returns_stops_confidence_and_caveat():
    out = predict_stop_counts(2024, "Bahrain", table=_strategy_table())
    assert out["qualitative"] is False
    assert out["sc_caveat"] == SC_CAVEAT
    assert len(out["drivers"]) == 4
    d0 = out["drivers"][0]
    assert set(d0) == {"driver", "n_stops", "confidence"}
    assert isinstance(d0["n_stops"], int)
    assert 0.0 <= d0["confidence"] <= 1.0
    assert d0["confidence"] == round(d0["confidence"], 3)


def test_sparse_prior_returns_qualitative_band_with_caveat():
    one_race = _strategy_table()
    one_race = one_race[one_race["race_id"].isin(["2023-Bahrain", "2024-Bahrain"])]
    out = predict_stop_counts(2024, "Bahrain", table=one_race)
    assert out["qualitative"] is True
    assert out["sc_caveat"] == SC_CAVEAT
    assert out["drivers"] == []
