import pandas as pd

from src.inference.stops import actual_stops, historical_stop_norm


def _table():
    return pd.DataFrame([
        {"race_id": "2023-Great Britain", "year": 2023, "gp": "Great Britain",
         "modal_stops": 1, "n_drivers": 20, "n_at_modal": 12, "stops_min": 1, "stops_max": 2},
        {"race_id": "2024-Great Britain", "year": 2024, "gp": "Great Britain",
         "modal_stops": 2, "n_drivers": 20, "n_at_modal": 11, "stops_min": 1, "stops_max": 3},
        {"race_id": "2025-Great Britain", "year": 2025, "gp": "Great Britain",
         "modal_stops": 2, "n_drivers": 20, "n_at_modal": 14, "stops_min": 1, "stops_max": 2},
        {"race_id": "2026-Austria", "year": 2026, "gp": "Austria",
         "modal_stops": 2, "n_drivers": 22, "n_at_modal": 14, "stops_min": 1, "stops_max": 3},
    ])


def test_actual_stops_returns_row_or_none():
    t = _table()
    assert actual_stops(2026, "Austria", t)["modal_stops"] == 2
    assert actual_stops(2026, "Great Britain", t) is None  # no 2026 GB row -> upcoming


def test_historical_norm_uses_strictly_prior_seasons():
    t = _table()
    # Predicting 2026 Great Britain -> modal across 2023-25 (1,2,2) = 2, over 3 seasons.
    norm = historical_stop_norm("Great Britain", t, before_year=2026)
    assert norm == {"modal_stops": 2, "n_seasons": 3}
    # No leakage: with before_year=2024 only 2023 counts.
    assert historical_stop_norm("Great Britain", t, before_year=2024) == {"modal_stops": 1, "n_seasons": 1}
    assert historical_stop_norm("Narnia", t, before_year=2026) is None
