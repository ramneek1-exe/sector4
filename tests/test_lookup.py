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


def test_pit_loss_comes_from_curated_track_features():
    out = lookup_stat("pit_loss", "Bahrain")
    assert out["value"] == 23.0
    assert out["units"] == "s"


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


def test_pit_loss_monaco_is_curated():
    out = lookup_stat("pit_loss", "Monaco")
    assert out["value"] == 19.5
    assert out["units"] == "s"
    assert out["source"] == "curated track features"
