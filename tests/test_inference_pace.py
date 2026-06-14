"""Tests for predict_pace_gaps (Model A inference, M1)."""
import numpy as np
import pandas as pd

from src.inference.pace import predict_pace_gaps


def _pace_table(n_prior_races=4):
    rng = np.random.default_rng(0)
    rows = []
    circuits = ["Bahrain", "Saudi Arabia", "Spain", "Hungary", "Italy"]
    # prior weekends (2023) + the target (2024-Bahrain)
    for gp in circuits[:n_prior_races]:
        for d in ["VER", "HAM", "LEC", "NOR"]:
            slow = rng.normal(0, 0.3)
            rows.append({"race_id": f"2023-{gp}", "gp": gp, "Driver": d,
                         "fp_pace_delta": slow, "fp_deg_slope": 0.05 + slow * 0.1,
                         "length_km": 5.0, "n_corners": 15, "abrasiveness": 3,
                         "pit_loss_s": 21.0, "race_pace_delta": slow})
    for d, fp in [("VER", -0.4), ("HAM", -0.1), ("LEC", 0.2), ("NOR", 0.3)]:
        rows.append({"race_id": "2024-Bahrain", "gp": "Bahrain", "Driver": d,
                     "fp_pace_delta": fp, "fp_deg_slope": 0.05, "length_km": 5.4,
                     "n_corners": 15, "abrasiveness": 5, "pit_loss_s": 23.0,
                     "race_pace_delta": fp})
    return pd.DataFrame(rows)


def test_predict_pace_gaps_returns_rounded_deltas_and_uncertainty():
    out = predict_pace_gaps(2024, "Bahrain", table=_pace_table())
    assert out["qualitative"] is False
    assert out["n_train_races"] == 4
    assert len(out["drivers"]) == 4
    d0 = out["drivers"][0]
    assert set(d0) == {"driver", "pace_delta_s", "uncertainty_s"}
    # rounded to 3 dp
    assert d0["pace_delta_s"] == round(d0["pace_delta_s"], 3)
    assert d0["uncertainty_s"] >= 0
    # sorted fastest (most negative) first
    deltas = [d["pace_delta_s"] for d in out["drivers"]]
    assert deltas == sorted(deltas)


def test_sparse_prior_returns_qualitative_band():
    out = predict_pace_gaps(2024, "Bahrain", table=_pace_table(n_prior_races=2))
    assert out["qualitative"] is True
    assert out["drivers"] == []


def test_missing_target_row_is_qualitative():
    out = predict_pace_gaps(2025, "Monaco", table=_pace_table())
    assert out["qualitative"] is True
