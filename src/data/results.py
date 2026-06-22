"""Race-results loader for Friday-state features (standings, form, track history).

Results only — no laps/telemetry — so this is cheap. We pull the FULL calendar
(every round), not just the spike circuits, because championship standings and
trailing form depend on all races prior in time. Cached to a parquet so we never
refetch.
"""
from __future__ import annotations

import logging
import os

import fastf1
import pandas as pd

from src.data.load import enable_cache

logger = logging.getLogger(__name__)


def load_season_results(year: int) -> pd.DataFrame:
    """One row per driver per round: year, round, gp, date, Driver, finish_pos, points."""
    enable_cache()
    sched = fastf1.get_event_schedule(year, include_testing=False)
    frames = []
    for _, ev in sched.iterrows():
        rnd = int(ev["RoundNumber"])
        if rnd == 0:
            continue
        try:
            s = fastf1.get_session(year, rnd, "R")
            s.load(laps=False, telemetry=False, weather=False, messages=False)
            res = s.results
        except Exception as e:  # noqa: BLE001
            logger.warning("No results for %s round %s: %s", year, rnd, e)
            continue
        if res is None or res.empty:
            continue
        cols = ["Abbreviation", "Position", "Points", "TeamName"]
        df = res[cols].rename(
            columns={"Abbreviation": "Driver", "Position": "finish_pos",
                     "Points": "points", "TeamName": "team"}
        )
        df["year"] = year
        df["round"] = rnd
        df["gp"] = ev["EventName"]
        df["date"] = pd.to_datetime(ev["EventDate"])
        frames.append(df)
    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def load_results(years: list[int], cache_path: str = "data/season_results.parquet",
                 refresh_year: int | None = None) -> pd.DataFrame:
    """Load (and cache) all race results for the given seasons, sorted by date.

    `refresh_year` forces a re-pull of that one season — an in-progress season gains
    rounds over time, so its cached slice goes stale; every other cached season is
    reused. With no refresh and all years already cached, returns the cached subset.
    """
    cached = pd.read_parquet(cache_path) if os.path.exists(cache_path) else None
    if (cached is not None and refresh_year is None
            and set(years).issubset(set(cached["year"].unique()))):
        return cached[cached["year"].isin(years)].reset_index(drop=True)

    cached_years = set(cached["year"].unique()) if cached is not None else set()
    frames = []
    for y in years:
        if cached is not None and y != refresh_year and y in cached_years:
            frames.append(cached[cached["year"] == y])
        else:
            frames.append(load_season_results(y))
    out = pd.concat([f for f in frames if not f.empty], ignore_index=True)
    out = out.dropna(subset=["finish_pos"]).sort_values("date").reset_index(drop=True)
    out.to_parquet(cache_path)
    return out
