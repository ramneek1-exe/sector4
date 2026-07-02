# src/inference/lookup.py
"""lookup_stat — computed-stat lookups (design §7). No ML, no fastf1.

pit_loss reads the DATA-DERIVED pit-loss table (full time lost by pitting, incl. the
~2.5s stationary change), year-aware (defaults to the latest season we hold) and carries
grounded insights (the stationary share + where the circuit ranks on the calendar).
tyre_deg / stint_length read the persisted strategy feature table. Numbers are rounded at
the boundary (house rule).
"""
from __future__ import annotations

import pandas as pd

from src import store
from src.features.pit_loss import STATIONARY_S_EST

PIT_LOSS = "pit_loss"
TYRE_DEG = "tyre_deg"
STINT_LENGTH = "stint_length"

# Below this many clean stop-pair samples, a single season's pit-loss median is noisy; the
# default (latest-season) lookup blends a multi-year median instead (China 2026 ~ 7 samples).
MIN_PIT_LOSS_SAMPLES = 12


def _pit_loss_insights(pit: pd.DataFrame, value: float) -> list[str]:
    """Grounded one-liners explaining a pit-loss number, computed from our own table."""
    insights = [
        f"About {STATIONARY_S_EST:.1f}s of that is the car sitting still for the tyre change."
    ]
    # Compare against the latest value at every other circuit we hold.
    latest = pit.sort_values("year").groupby("gp").tail(1)["pit_loss_s"]
    if len(latest) >= 4:
        lo, hi = round(float(latest.min()), 1), round(float(latest.max()), 1)
        if value <= latest.quantile(0.25):
            where = "one of the shortest pit-lane losses on the calendar"
        elif value >= latest.quantile(0.75):
            where = "one of the longest pit-lane losses on the calendar"
        else:
            where = "around the middle of the calendar for pit-lane loss"
        insights.append(f"That makes it {where} (circuits range ~{lo}–{hi}s).")
    return insights


def _pit_loss(gp: str, year: int | None, pit: pd.DataFrame) -> dict:
    rows = pit[pit["gp"] == gp]
    if rows.empty:
        return {"stat": PIT_LOSS, "gp": gp, "value": None, "units": None, "year": None,
                "source": "no race data for this circuit", "insights": []}
    blended = False
    if year is not None and (rows["year"] == year).any():
        row = rows[rows["year"] == year].iloc[0]  # explicit year -> respect verbatim
        value, rep_year = round(float(row["pit_loss_s"]), 1), int(row["year"])
    else:
        row = rows.sort_values("year").iloc[-1]  # default: latest season we hold
        rep_year = int(row["year"])
        if int(row["n_stops"]) < MIN_PIT_LOSS_SAMPLES and len(rows) > 1:
            value = round(float(rows["pit_loss_s"].median()), 1)  # thin sample -> multi-year median
            blended = True
        else:
            value = round(float(row["pit_loss_s"]), 1)
    insights = _pit_loss_insights(pit, value)
    if blended:
        insights.append(
            f"This weekend's sample was small, so this is a median across {len(rows)} recent seasons."
        )
    return {"stat": PIT_LOSS, "gp": gp, "value": value, "units": "s",
            "year": rep_year,
            "source": "derived from race pit-stop laps (incl. the stationary stop)",
            "insights": insights}


def lookup_stat(stat: str, gp: str, table: pd.DataFrame | None = None,
                pit_table: pd.DataFrame | None = None, year: int | None = None) -> dict:
    """Return a computed stat for a circuit as a typed, rounded dict."""
    if stat == PIT_LOSS:
        pit = pit_table if pit_table is not None else store.read_table(store.PIT_LOSS)
        return _pit_loss(gp, year, pit)

    if stat not in (TYRE_DEG, STINT_LENGTH):
        raise ValueError(f"unknown stat: {stat!r}")

    table = table if table is not None else store.read_table(store.STRATEGY_TABLE)
    rows = table[table["gp"] == gp]
    if rows.empty:
        return {"stat": stat, "gp": gp, "value": None, "units": None,
                "source": "no FP data for circuit"}

    if stat == TYRE_DEG:
        return {"stat": stat, "gp": gp,
                "value": round(float(rows["deg_overall"].median()), 3),
                "units": "s/lap", "source": "FP long-run Theil-Sen deg"}
    # STINT_LENGTH
    return {"stat": stat, "gp": gp, "value": int(rows["feas_max_stint"].max()),
            "units": "laps", "source": "FP longest clean stint"}
