"""Tests for strategy/compound extraction from race laps (Model B spike)."""
import numpy as np
import pandas as pd
import pytest

from src.features.strategy import (
    add_history,
    count_stops,
    dominant_compound,
    sc_disruption_fraction,
)


def _laps(rows):
    return pd.DataFrame(rows, columns=["Driver", "Stint", "Compound", "TrackStatus"])


def test_count_stops_is_stints_minus_one():
    laps = _laps(
        [
            ("VER", 1, "M", "1"), ("VER", 1, "M", "1"), ("VER", 2, "H", "1"),
            ("VER", 2, "H", "1"), ("VER", 3, "H", "1"),     # 3 stints -> 2 stops
            ("HAM", 1, "M", "1"), ("HAM", 1, "M", "1"),     # 1 stint  -> 0 stops
            ("LEC", 1, "S", "1"), ("LEC", 2, "M", "1"),     # 2 stints -> 1 stop
        ]
    )
    out = count_stops(laps).set_index("Driver")["n_stops"]
    assert out["VER"] == 2
    assert out["HAM"] == 0
    assert out["LEC"] == 1


def test_dominant_compound_is_most_used_dry_compound():
    laps = _laps(
        [("D%d" % i, 1, "MEDIUM", "1") for i in range(10)]
        + [("D%d" % i, 2, "HARD", "1") for i in range(5)]
        + [("D%d" % i, 3, "SOFT", "1") for i in range(2)]
    )
    assert dominant_compound(laps) == "MEDIUM"


def test_dominant_compound_ignores_wet_tyres():
    laps = _laps(
        [("A", 1, "INTERMEDIATE", "1")] * 8
        + [("B", 1, "HARD", "1")] * 5
        + [("C", 1, "MEDIUM", "1")] * 3
    )
    # wets excluded -> HARD wins among dry compounds
    assert dominant_compound(laps) == "HARD"


def test_sc_disruption_fraction_counts_non_green_safety_laps():
    laps = _laps(
        [("A", 1, "M", "1")] * 6      # green
        + [("A", 1, "M", "4")] * 2    # safety car
        + [("A", 1, "M", "6")] * 1    # VSC
        + [("A", 1, "M", "2")] * 1    # yellow (not counted as SC/VSC/red)
    )
    # 3 of 10 laps under SC/VSC -> 0.3
    assert sc_disruption_fraction(laps) == pytest.approx(0.3)


def test_add_history_uses_strictly_prior_years_only():
    race_df = pd.DataFrame(
        {
            "gp": ["Bahrain", "Bahrain", "Bahrain"],
            "year": [2023, 2024, 2025],
            "modal_stops": [1, 2, 2],
            "dominant_compound": ["HARD", "MEDIUM", "MEDIUM"],
        }
    )
    df = pd.DataFrame({"gp": ["Bahrain", "Bahrain"], "year": [2024, 2025]})
    out = add_history(df, race_df).set_index("year")
    # 2024 sees only 2023 -> modal 1, HARD
    assert out.loc[2024, "hist_modal_stops"] == 1
    assert out.loc[2024, "hist_dominant"] == "HARD"
    # 2025 sees 2023+2024 -> dominant HARD-vs-MEDIUM
    assert out.loc[2025, "hist_dominant"] in {"HARD", "MEDIUM"}


def test_add_history_no_prior_year_is_nan_and_none():
    race_df = pd.DataFrame(
        {"gp": ["Spain"], "year": [2023], "modal_stops": [2],
         "dominant_compound": ["SOFT"]}
    )
    df = pd.DataFrame({"gp": ["Spain"], "year": [2023]})
    out = add_history(df, race_df).iloc[0]
    assert pd.isna(out["hist_modal_stops"])
    assert out["hist_dominant"] is None
