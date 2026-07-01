"""Actual + historical-norm stop-count reads over the bundled actual_stops table. No fastf1."""
from __future__ import annotations

import pandas as pd


def actual_stops(year: int, gp: str, table: pd.DataFrame) -> dict | None:
    """The completed race's stop distribution as a dict, or None if there is no row."""
    rows = table[(table["year"] == year) & (table["gp"] == gp)]
    if rows.empty:
        return None
    r = rows.iloc[0]
    return {
        "modal_stops": int(r["modal_stops"]), "n_drivers": int(r["n_drivers"]),
        "n_at_modal": int(r["n_at_modal"]), "stops_min": int(r["stops_min"]),
        "stops_max": int(r["stops_max"]),
    }


def historical_stop_norm(gp: str, table: pd.DataFrame,
                         before_year: int | None = None) -> dict | None:
    """Modal stop count across STRICTLY-PRIOR seasons at this circuit (leakage-safe)."""
    rows = table[table["gp"] == gp]
    if before_year is not None:
        rows = rows[rows["year"] < before_year]
    if rows.empty:
        return None
    return {"modal_stops": int(rows["modal_stops"].mode().iloc[0]), "n_seasons": int(len(rows))}
