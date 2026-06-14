# src/store.py
"""Feature-store I/O + the leakage-safe slicing chokepoint (M1, design §5, §6).

Inference reads ONLY these parquet tables — never fastf1. prior_weekends is the
single place the leakage guard lives: it returns rows strictly BEFORE the target
weekend in CALENDAR order (src.calendar), never alphabetical race_id sorting.
Pure pandas + src.calendar — importing this module does not import fastf1.
"""
from __future__ import annotations

import os

import pandas as pd

from src.calendar import calendar_order, race_id

PACE_TABLE = "data/pace_features.parquet"
STRATEGY_TABLE = "data/strategy_features.parquet"


def write_table(df: pd.DataFrame, path: str) -> None:
    """Persist a feature table to parquet, creating the directory if needed."""
    parent = os.path.dirname(path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    df.to_parquet(path)


def read_table(path: str) -> pd.DataFrame:
    """Load a persisted feature table."""
    return pd.read_parquet(path)


def prior_weekends(table: pd.DataFrame, year: int, gp: str,
                   order: list[str] | None = None) -> pd.DataFrame:
    """Rows from races strictly BEFORE (year, gp) in calendar order.

    The single leakage chokepoint. `table` must have a 'race_id' column. When the
    target is on the known calendar, returns rows from earlier calendar positions
    only. When the target is NOT on the calendar (e.g. a future weekend we cannot
    place), every calendar-placeable row is treated as prior, which is the correct
    production semantic for an upcoming race after all known history.
    """
    order = order if order is not None else calendar_order()
    target = race_id(year, gp)
    present = set(table["race_id"])
    if target in order:
        cutoff = order.index(target)
        prior_ids = set(order[:cutoff])
    else:
        prior_ids = set(order)  # unknown future target: all known history is prior
    keep = prior_ids & present
    return table[table["race_id"].isin(keep)].copy()
