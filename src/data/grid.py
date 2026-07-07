"""Qualifying-grid loader (M6 pre-work: post-quali podium sharpening).

The upcoming-weekend podium predictor sharpens Friday -> Saturday when given the
grid (`src/inference/upcoming.py`). That grid is the qualifying classification, which
only exists once quali has run. fastf1 is the source of truth, so this loader runs in
the R17 batch job (CI), NEVER serverless — its output is persisted to a small JSON the
TS layer reads. Results-only (no laps/telemetry), so it is cheap.
"""
from __future__ import annotations

import logging

import fastf1
import pandas as pd

from src.calendar import GP_TO_EVENT
from src.data.load import enable_cache, session_in_future

logger = logging.getLogger(__name__)


def load_qualifying_grid(year: int, gp: str) -> dict[str, int]:
    """Return {driver_abbreviation: grid_position} from a weekend's qualifying.

    `gp` is a short calendar key (e.g. "Austria"); it is mapped to the fastf1 event
    name via GP_TO_EVENT. Returns an empty dict if quali has not run / is unpublished
    (fastf1 does not raise for a future session — its results come back empty), so the
    caller degrades to honest Friday mode rather than a fake grid.

    Same occurred-gate as `load_session`: fastf1 leaks a future session's classification,
    so a scheduled date later than now is rejected BEFORE loading — otherwise a premature
    grid could be written into grids.json and prematurely sharpen the podium to Saturday.
    """
    enable_cache()
    event = GP_TO_EVENT.get(gp, gp)
    try:
        s = fastf1.get_session(year, event, "Q")
        if session_in_future(getattr(s, "date", None)):
            logger.info("Skipping qualifying grid for %s %s: session not yet held (future date)", year, gp)
            return {}
        s.load(laps=False, telemetry=False, weather=False, messages=False)
        res = s.results
    except Exception as e:  # noqa: BLE001 - any failure degrades to "no grid yet"
        logger.warning("No qualifying grid for %s %s: %s", year, gp, e)
        return {}
    if res is None or res.empty:
        return {}
    grid: dict[str, int] = {}
    for _, row in res.iterrows():
        abbr = row.get("Abbreviation")
        pos = row.get("Position")
        if abbr is None or pd.isna(pos):
            continue
        grid[str(abbr)] = int(round(float(pos)))
    return grid
