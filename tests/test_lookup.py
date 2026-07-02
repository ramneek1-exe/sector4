# tests/test_lookup.py
"""Tests for lookup_stat computed-stat lookups (M1)."""
import pandas as pd
import pytest

from src.inference.lookup import lookup_stat


def _strategy_table():
    return pd.DataFrame(
        {
            "gp": ["Bahrain", "Bahrain", "Spain"],
            "deg_overall": [0.10, 0.20, 0.05],
            "feas_max_stint": [18, 22, 30],
        }
    )


def _pit_table():
    return pd.DataFrame(
        [
            {"race_id": "2025-Bahrain", "year": 2025, "gp": "Bahrain", "pit_loss_s": 23.4, "n_stops": 27},
            {"race_id": "2024-Bahrain", "year": 2024, "gp": "Bahrain", "pit_loss_s": 22.9, "n_stops": 25},
        ]
    )


def test_pit_loss_comes_from_derived_table():
    out = lookup_stat("pit_loss", "Bahrain", pit_table=_pit_table())
    assert out["value"] == 23.4  # latest season
    assert out["units"] == "s"
    assert out["source"].startswith("derived")


def test_tyre_deg_is_median_over_circuit_rows():
    out = lookup_stat("tyre_deg", "Bahrain", table=_strategy_table())
    assert out["value"] == 0.15  # median(0.10, 0.20)
    assert out["units"] == "s/lap"


def test_stint_length_is_max_feasible_stint():
    out = lookup_stat("stint_length", "Spain", table=_strategy_table())
    assert out["value"] == 30
    assert out["units"] == "laps"


def test_unknown_circuit_returns_none_value():
    out = lookup_stat("tyre_deg", "Imola", table=_strategy_table())
    assert out["value"] is None


def test_unknown_stat_raises():
    with pytest.raises(ValueError):
        lookup_stat("top_speed", "Bahrain", table=_strategy_table())


def test_pit_loss_non_derived_circuit_is_honestly_unavailable():
    out = lookup_stat("pit_loss", "Imola", pit_table=_pit_table())
    assert out["value"] is None
    assert out["units"] is None
    assert out["source"] == "no race data for this circuit"


def _pit_df(rows):
    return pd.DataFrame(rows)


def test_thin_latest_sample_blends_multi_year_median():
    # Latest (2026) has a thin sample; a prior full-sample year exists -> blend the median.
    pit = _pit_df([
        {"race_id": "2025-China", "year": 2025, "gp": "China", "pit_loss_s": 22.0, "n_stops": 30},
        {"race_id": "2026-China", "year": 2026, "gp": "China", "pit_loss_s": 15.4, "n_stops": 5},
    ])
    out = lookup_stat("pit_loss", "China", pit_table=pit)
    assert out["value"] == 18.7  # median(22.0, 15.4), rounded
    assert any("season" in i.lower() for i in out["insights"])


def test_adequate_latest_sample_is_unchanged():
    pit = _pit_df([
        {"race_id": "2025-China", "year": 2025, "gp": "China", "pit_loss_s": 22.0, "n_stops": 30},
        {"race_id": "2026-China", "year": 2026, "gp": "China", "pit_loss_s": 20.5, "n_stops": 28},
    ])
    out = lookup_stat("pit_loss", "China", pit_table=pit)
    assert out["value"] == 20.5  # latest respected; no blend


def test_explicit_year_is_respected_even_if_thin():
    pit = _pit_df([
        {"race_id": "2025-China", "year": 2025, "gp": "China", "pit_loss_s": 22.0, "n_stops": 30},
        {"race_id": "2026-China", "year": 2026, "gp": "China", "pit_loss_s": 15.4, "n_stops": 5},
    ])
    out = lookup_stat("pit_loss", "China", pit_table=pit, year=2026)
    assert out["value"] == 15.4  # asked for 2026 explicitly -> no blend
