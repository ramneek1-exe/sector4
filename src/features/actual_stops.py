"""Actual per-race pit-stop counts, derived from race laps (no FP, no dry filter).

Unlike the Model-B strategy features (which need a dry FP2 long run), this works for EVERY
completed race — sprint or wet — because it reads only what drivers actually did. Feeds the
"how many stops happened" answer for completed races and the per-circuit historical norm for
upcoming races.
"""
from __future__ import annotations

import pandas as pd

from src.calendar import RACE_CALENDAR, race_id
from src.data.load import load_session
from src.features.strategy import count_stops

# Completed 2026 rounds + the next race (Great Britain) — enough for completed-race actuals AND
# the per-circuit historical norm. Widen with the calendar as the season progresses (see the
# staying-current task). Great Britain is a real, historical circuit in GP_TO_EVENT.
STOPS_CIRCUITS: list[str] = list(dict.fromkeys(RACE_CALENDAR[2026] + ["Great Britain"]))


def race_stop_distribution(laps: pd.DataFrame) -> dict:
    """Summarise a race's actual stop counts: modal, spread, and how many ran the mode."""
    stops = count_stops(laps)["n_stops"]
    modal = int(stops.mode().iloc[0])
    return {
        "modal_stops": modal,
        "n_drivers": int(len(stops)),
        "n_at_modal": int((stops == modal).sum()),
        "stops_min": int(stops.min()),
        "stops_max": int(stops.max()),
    }
