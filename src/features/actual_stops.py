"""Actual per-race pit-stop counts, derived from race laps + results (no FP, no dry filter).

Unlike the Model-B strategy features (which need a dry FP2 long run), this works for EVERY
completed race — sprint or wet — because it reads only what drivers actually did. Feeds the
"how many stops happened" answer for completed races and the per-circuit historical norm for
upcoming races.

A pit stop is a COMPOUND CHANGE between consecutive stints, NOT a stint transition: red-flag
restarts create phantom same-compound stints that inflate a naive stint count (2026 Monaco
reads 5 stops that way vs 2 real). Only CLASSIFIED finishers count, so retirements do not
pollute the modal with 0-stop rows.
"""
from __future__ import annotations

import pandas as pd

# The full 2026 circuit roster in schedule order. build_actual_stops sweeps ALL of these so
# every circuit has prior-season rows for the historical-norm answer; the occurred-gate still
# limits which get a 2026 ACTUALS row to RACE_CALENDAR[2026] (the completed rounds). Do NOT
# fold this into RACE_CALENDAR — that would break the occurred-gate (see the plan's Task 7).
STOPS_CIRCUITS: list[str] = [
    "Australia", "China", "Japan", "Miami", "Canada", "Monaco", "Barcelona", "Austria",
    "Great Britain", "Belgium", "Hungary", "Netherlands", "Italy", "Spain", "Azerbaijan",
    "Singapore", "United States", "Mexico City", "São Paulo", "Las Vegas", "Qatar", "Abu Dhabi",
]


def race_stop_distribution(laps: pd.DataFrame, results: pd.DataFrame) -> dict:
    """Actual stop distribution among classified finishers, robust to red-flag phantom stints.

    Returns {} if there are no classified finishers (so the builder skips the race).
    """
    classified = None
    if results is not None and "ClassifiedPosition" in results:
        classified = set(
            results.loc[
                results["ClassifiedPosition"].astype(str).str.fullmatch(r"\d+"), "Abbreviation"
            ]
        )
    counts: dict[str, int] = {}
    for drv, d in laps.groupby("Driver"):
        if classified is not None and drv not in classified:
            continue
        comp = d.sort_values("Stint").groupby("Stint")["Compound"].first()
        counts[drv] = max(int((comp != comp.shift()).sum() - 1), 0)  # compound changes
    stops = pd.Series(counts)
    if stops.empty:
        return {}
    modal = int(stops.mode().iloc[0])
    return {
        "modal_stops": modal,
        "n_drivers": int(len(stops)),
        "n_at_modal": int((stops == modal).sum()),
        "stops_min": int(stops.min()),
        "stops_max": int(stops.max()),
    }
