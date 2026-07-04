"""Tests for predict_stop_counts (Model B inference, M1)."""
import pandas as pd

from src.inference.strategy import SC_CAVEAT, dominant_compound_norm, predict_stop_counts


def _strategy_table():
    rows = []
    # prior 2023 weekends: high-deg -> 2 stops, low-deg -> 1 stop
    for gp, deg, stops in [("Bahrain", 0.25, 2), ("Saudi Arabia", 0.05, 1),
                           ("Spain", 0.22, 2), ("Hungary", 0.06, 1)]:
        for d in ["VER", "HAM", "LEC", "NOR"]:
            rows.append({"race_id": f"2023-{gp}", "year": 2023, "gp": gp, "Driver": d,
                         "n_stops": stops,
                         "pit_loss_s": 21.0, "abrasiveness": 3, "track_temp": 35.0,
                         "hist_modal_stops": stops, "deg_overall": deg,
                         "deg_SOFT": deg, "deg_MEDIUM": deg, "deg_HARD": deg,
                         "feas_max_stint": 20})
    # target 2024-Bahrain (high deg)
    for d in ["VER", "HAM", "LEC", "NOR"]:
        rows.append({"race_id": "2024-Bahrain", "year": 2024, "gp": "Bahrain", "Driver": d,
                     "n_stops": 2,
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


def test_dominant_summary_is_modal_stop_count_and_share():
    out = predict_stop_counts(2024, "Bahrain", table=_strategy_table())
    dom = out["dominant"]
    assert dom["n_drivers"] == 4
    assert isinstance(dom["n_stops"], int)
    assert 0.0 <= dom["share"] <= 1.0
    assert dom["share"] == round(dom["share"], 3)
    # all four target drivers are high-deg Bahrain -> model leans the same way
    assert dom["share"] >= 0.5


def test_dominant_is_none_in_sparse_prior_branch():
    one_race = _strategy_table()
    one_race = one_race[one_race["race_id"].isin(["2023-Bahrain", "2024-Bahrain"])]
    out = predict_stop_counts(2024, "Bahrain", table=one_race)
    assert out["qualitative"] is True
    assert out["dominant"] is None


def test_sparse_prior_returns_qualitative_band_with_caveat():
    one_race = _strategy_table()
    one_race = one_race[one_race["race_id"].isin(["2023-Bahrain", "2024-Bahrain"])]
    out = predict_stop_counts(2024, "Bahrain", table=one_race)
    assert out["qualitative"] is True
    assert out["sc_caveat"] == SC_CAVEAT
    assert out["drivers"] == []


def test_recency_weighted_fit_runs_and_preserves_shape():
    # half_life_years threads a sample_weight through the classifier fit; output shape,
    # caveat, and dominant summary are unchanged.
    out = predict_stop_counts(2024, "Bahrain", table=_strategy_table(), half_life_years=1.0)
    assert out["qualitative"] is False
    assert out["sc_caveat"] == SC_CAVEAT
    assert len(out["drivers"]) == 4
    assert set(out["drivers"][0]) == {"driver", "n_stops", "confidence"}
    assert out["dominant"]["n_drivers"] == 4


def _compound_table(rows):
    """rows: list of (year, gp, hist_dominant). Two driver rows per running to exercise dedup."""
    recs = []
    for y, gp, hd in rows:
        for drv in ("AAA", "BBB"):
            recs.append({"year": y, "gp": gp, "hist_dominant": hd, "Driver": drv, "n_stops": 1})
    return pd.DataFrame(recs)


def test_compound_norm_uses_exact_year_row():
    t = _compound_table([(2024, "Italy", "MEDIUM")])
    out = dominant_compound_norm(2024, "Italy", table=t)
    assert out == {"year": 2024, "gp": "Italy", "compound": "MEDIUM", "basis_year": 2024}


def test_compound_norm_upcoming_falls_back_to_latest_prior_running():
    t = _compound_table([(2024, "Italy", "SOFT"), (2025, "Italy", "HARD")])
    out = dominant_compound_norm(2026, "Italy", table=t)
    assert out["compound"] == "HARD"
    assert out["basis_year"] == 2025


def test_compound_norm_skips_null_hist_dominant():
    t = _compound_table([(2023, "Italy", None), (2024, "Italy", "MEDIUM")])
    out = dominant_compound_norm(2026, "Italy", table=t)
    assert out["compound"] == "MEDIUM"
    assert out["basis_year"] == 2024


def test_compound_norm_no_history_returns_none():
    t = _compound_table([(2024, "Italy", "MEDIUM")])
    out = dominant_compound_norm(2026, "Baku", table=t)
    assert out == {"year": 2026, "gp": "Baku", "compound": None, "basis_year": None}


def test_compound_norm_never_reads_future_year_for_value():
    # target 2024 must use the 2024 row (SOFT), never peek at 2025 (HARD).
    t = _compound_table([(2024, "Italy", "SOFT"), (2025, "Italy", "HARD")])
    out = dominant_compound_norm(2024, "Italy", table=t)
    assert out["compound"] == "SOFT"
