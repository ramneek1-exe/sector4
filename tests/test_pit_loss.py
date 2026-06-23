"""Tests for the data-derived pit-loss lookup (year-aware + grounded insights)."""
import pandas as pd

from src.calendar import race_id
from src.inference.lookup import lookup_stat


def _pit_table() -> pd.DataFrame:
    rows = [
        (2024, "Austria", 21.0), (2025, "Austria", 20.8),
        (2025, "Italy", 25.4),   # long pit lane
        (2026, "China", 15.4),   # short pit lane
        (2025, "Hungary", 21.1),
        (2025, "Bahrain", 23.4),
    ]
    return pd.DataFrame(
        [{"race_id": race_id(y, gp), "year": y, "gp": gp, "pit_loss_s": v, "n_stops": 20}
         for y, gp, v in rows]
    )


def test_pit_loss_defaults_to_latest_season():
    out = lookup_stat("pit_loss", "Austria", pit_table=_pit_table())
    assert out["value"] == 20.8
    assert out["year"] == 2025
    assert out["units"] == "s"


def test_pit_loss_honors_explicit_year():
    out = lookup_stat("pit_loss", "Austria", pit_table=_pit_table(), year=2024)
    assert out["value"] == 21.0
    assert out["year"] == 2024


def test_pit_loss_insights_explain_the_number():
    out = lookup_stat("pit_loss", "Austria", pit_table=_pit_table())
    joined = " ".join(out["insights"]).lower()
    assert "tyre change" in joined       # the ~2.5s stationary stop is surfaced
    assert "pit-lane" in joined          # calendar-ranking insight present


def test_pit_loss_ranks_short_and_long_circuits():
    t = _pit_table()
    short = " ".join(lookup_stat("pit_loss", "China", pit_table=t)["insights"]).lower()
    long = " ".join(lookup_stat("pit_loss", "Italy", pit_table=t)["insights"]).lower()
    assert "shortest" in short
    assert "longest" in long


def test_pit_loss_unknown_circuit_is_honestly_unavailable():
    out = lookup_stat("pit_loss", "Imola", pit_table=_pit_table())
    assert out["value"] is None
    assert out["year"] is None
    assert out["insights"] == []
