# src/calendar.py
"""Canonical calendar ordering + the dry circuit set (M1, design §4, §6).

The leakage guard (src/store.py) depends on TRUE calendar order, never
alphabetical race_id sorting — that was a prior phase's silent look-ahead bug.
DRY_CIRCUITS is maintained in season race order, so year-major + list order =
calendar order. race_id is "<year>-<gp>" to match the Phase 1 feature tables.
Pure module: no fastf1, no pandas.
"""
from __future__ import annotations

# Representative dry circuit set, listed in season race order.
DRY_CIRCUITS = [
    "Bahrain", "Saudi Arabia", "Spain", "Hungary",
    "Italy", "Mexico City", "Las Vegas", "Abu Dhabi",
]
SEASONS = [2023, 2024, 2025]

# Circuit key (feature-table `gp`) -> results EventName, for joining race results
# (standings/form/track history). Canonical home so notebooks/pipeline share one map.
GP_TO_EVENT = {
    "Bahrain": "Bahrain Grand Prix",
    "Saudi Arabia": "Saudi Arabian Grand Prix",
    "Spain": "Spanish Grand Prix",
    "Hungary": "Hungarian Grand Prix",
    "Italy": "Italian Grand Prix",
    "Mexico City": "Mexico City Grand Prix",
    "Las Vegas": "Las Vegas Grand Prix",
    "Abu Dhabi": "Abu Dhabi Grand Prix",
}


def race_id(year: int, gp: str) -> str:
    """Canonical race identifier, e.g. (2024, "Bahrain") -> "2024-Bahrain"."""
    return f"{year}-{gp}"


def calendar_order(seasons: list[int] = SEASONS,
                   circuits: list[str] = DRY_CIRCUITS) -> list[str]:
    """All race_ids in calendar order (year-major, circuit list order within year)."""
    return [race_id(y, gp) for y in seasons for gp in circuits]
