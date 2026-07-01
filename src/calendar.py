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

# Real per-season race order. 2023-25 keep the validated dry set (validation parity);
# 2026 lists the real rounds run so far, in true schedule order, ending at the target
# (Austria). The leakage guard (src.store.prior_weekends) depends on this being true
# calendar order — never alphabetical. Source: scripts/derisk_2026.py (M5).
RACE_CALENDAR: dict[int, list[str]] = {
    2023: DRY_CIRCUITS,
    2024: DRY_CIRCUITS,
    2025: DRY_CIRCUITS,
    # 2026 rounds 1-8; round 8 (Austria) is the upcoming target, 1-7 completed. NOTE:
    # 2026 has BOTH "Barcelona Grand Prix" (round 7) and "Spanish Grand Prix" (Madrid,
    # later) as distinct events; no Bahrain/Saudi at the front this season.
    2026: ["Australia", "China", "Japan", "Miami", "Canada", "Monaco",
           "Barcelona", "Austria"],
}

# Circuit key (feature-table `gp`) -> results EventName, for joining race results
# (standings/form/track history). Canonical home so notebooks/pipeline share one map.
# Covers every circuit RACE_CALENDAR references; 2026 names are the real fastf1 strings.
GP_TO_EVENT = {
    # validation dry set (2023-25 short keys)
    "Bahrain": "Bahrain Grand Prix",
    "Saudi Arabia": "Saudi Arabian Grand Prix",
    "Spain": "Spanish Grand Prix",
    "Hungary": "Hungarian Grand Prix",
    "Italy": "Italian Grand Prix",
    "Mexico City": "Mexico City Grand Prix",
    "Las Vegas": "Las Vegas Grand Prix",
    "Abu Dhabi": "Abu Dhabi Grand Prix",
    # 2026 calendar circuits (real fastf1 EventNames from the de-risk probe)
    "Australia": "Australian Grand Prix",
    "China": "Chinese Grand Prix",
    "Japan": "Japanese Grand Prix",
    "Miami": "Miami Grand Prix",
    "Canada": "Canadian Grand Prix",
    "Monaco": "Monaco Grand Prix",
    "Barcelona": "Barcelona Grand Prix",
    "Austria": "Austrian Grand Prix",
    "Great Britain": "British Grand Prix",
    "Belgium": "Belgian Grand Prix",
    "Netherlands": "Dutch Grand Prix",
    "Azerbaijan": "Azerbaijan Grand Prix",
    "Singapore": "Singapore Grand Prix",
    "United States": "United States Grand Prix",
    "São Paulo": "São Paulo Grand Prix",
    "Qatar": "Qatar Grand Prix",
}


def race_id(year: int, gp: str) -> str:
    """Canonical race identifier, e.g. (2024, "Bahrain") -> "2024-Bahrain"."""
    return f"{year}-{gp}"


def calendar_order(seasons: list[int] | None = None,
                   circuits: list[str] | None = None) -> list[str]:
    """All race_ids in true calendar order.

    With no arguments, flattens RACE_CALENDAR (the dry validation set for 2023-25 plus
    the real 2026 rounds) in year-major, real per-season order — this is what the
    leakage guard uses. The legacy (seasons, circuits) signature is retained for the
    validation notebooks/tests that pass the dry set explicitly (a cartesian product).
    """
    if seasons is None and circuits is None:
        return [race_id(y, gp) for y in sorted(RACE_CALENDAR) for gp in RACE_CALENDAR[y]]
    seasons = seasons if seasons is not None else SEASONS
    circuits = circuits if circuits is not None else DRY_CIRCUITS
    return [race_id(y, gp) for y in seasons for gp in circuits]
