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
