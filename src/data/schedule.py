"""Derive the live season's calendar + upcoming-weekend schedule from fastf1's event
schedule — the data-currency automation (handoff TODO #2).

R17 (the only environment with fastf1) calls derive_live_calendar to refresh the committed
src/race_calendar.json + app/data/weekend-schedule.json each weekend, so the calendar is no
longer hand-bumped. Detection is by RACE-SESSION DATE, never lap data: fastf1 leaks future
race laps (British R9 had laps pre-race), so a date/clock gate is the only safe signal.

The pure core (EventInfo/pre_quali_time/derive_calendar) is fastf1-free and fully unit
tested; derive_live_calendar is the thin fastf1 wrapper (added in the next task).
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

import fastf1
import pandas as pd

from src.calendar import GP_TO_EVENT
from src.data.load import enable_cache

logger = logging.getLogger(__name__)

# EventName -> short calendar key (inverse of GP_TO_EVENT; short<->long is 1:1).
_NAME_TO_KEY: dict[str, str] = {v: k for k, v in GP_TO_EVENT.items()}


@dataclass(frozen=True)
class EventInfo:
    """One round's identity + the naive-UTC datetimes the derivation needs."""
    round: int
    event_name: str
    race_dt: pd.Timestamp
    quali_dt: pd.Timestamp
    pre_dt: pd.Timestamp


def pre_quali_time(session_dts: list[pd.Timestamp | None], quali_dt: pd.Timestamp) -> pd.Timestamp:
    """The last practice/session strictly before qualifying (format-agnostic).

    Falls back to 3h before quali when no earlier session datetime is available.
    """
    befores = [d for d in session_dts if d is not None and pd.notna(d) and d < quali_dt]
    return max(befores) if befores else quali_dt - pd.Timedelta(hours=3)


def _iso(ts: pd.Timestamp) -> str:
    """Format a naive-UTC timestamp as the schedule's ISO-Z convention."""
    return pd.Timestamp(ts).strftime("%Y-%m-%dT%H:%M:%SZ")


def derive_calendar(events: list[EventInfo], now: pd.Timestamp, year: int,
                    name_to_key: dict[str, str] | None = None) -> dict:
    """Completed rounds + the single upcoming target, plus the weekend-schedule dict.

    `calendar` = every round whose race is in the past, followed by the earliest round whose
    race is not yet complete (the current/upcoming target). Never includes rounds beyond that
    single target — the fastf1 future-leak guard. Season over -> target is the finale and
    `calendar` is every completed round. Events not in `name_to_key` are skipped with a warning.
    """
    name_to_key = name_to_key if name_to_key is not None else _NAME_TO_KEY
    known: list[tuple[str, EventInfo]] = []
    for e in sorted(events, key=lambda x: x.round):
        key = name_to_key.get(e.event_name)
        if key is None:
            logger.warning("event %r not in GP_TO_EVENT inverse; skipping", e.event_name)
            continue
        known.append((key, e))
    if not known:
        return {"calendar": [], "schedule": None}

    completed = [k for k, e in known if e.race_dt < now]
    remaining = [(k, e) for k, e in known if e.race_dt >= now]
    if remaining:
        target = remaining[0][0]
        next_gp = remaining[1][0] if len(remaining) > 1 else None
    else:
        target = known[-1][0]  # season over -> finale
        next_gp = None

    calendar = completed + ([target] if target not in completed else [])
    tev = dict(known)[target]
    schedule = {
        "year": year,
        "gp": target,
        "preQuali": _iso(tev.pre_dt),
        "postQuali": _iso(tev.quali_dt),
        "final": _iso(tev.race_dt),
        "nextGp": next_gp,
    }
    return {"calendar": calendar, "schedule": schedule}


def _session_dt(event, name: str) -> pd.Timestamp | None:
    """A session's naive-UTC datetime by fastf1 session name, or None if unavailable."""
    try:
        ts = event.get_session_date(name, utc=True)
    except Exception:  # noqa: BLE001 - missing/unknown session degrades to None
        return None
    return None if ts is None or pd.isna(ts) else pd.Timestamp(ts)


def _col_dt(event, col: str) -> pd.Timestamp | None:
    """A schedule DateUtc column value as a naive Timestamp, or None."""
    val = event.get(col)
    return None if val is None or pd.isna(val) else pd.Timestamp(val)


def _event_info(rnd: int, event) -> EventInfo | None:
    """Build an EventInfo from a fastf1 Event row; None if no race datetime resolvable."""
    race_dt = _session_dt(event, "Race")
    if race_dt is None:
        ed = _col_dt(event, "EventDate")
        race_dt = ed + pd.Timedelta(hours=22) if ed is not None else None  # end-of-race-day
    if race_dt is None:
        return None
    quali_dt = _session_dt(event, "Qualifying") or (race_dt - pd.Timedelta(days=1))
    sess_dts = [_col_dt(event, f"Session{i}DateUtc") for i in range(1, 6)]
    return EventInfo(rnd, event["EventName"], race_dt, quali_dt, pre_quali_time(sess_dts, quali_dt))


def derive_live_calendar(year: int, now: pd.Timestamp | None = None) -> dict | None:
    """Fetch the season schedule (fastf1) and derive {calendar, schedule}; None on failure.

    Reads only get_event_schedule (dates), never lap data, so it is leak-safe and cheap.
    """
    if now is None:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
    now = pd.Timestamp(now)
    enable_cache()
    try:
        sched = fastf1.get_event_schedule(year, include_testing=False)
    except Exception as e:  # noqa: BLE001 - a transient fetch failure must not corrupt files
        logger.warning("schedule fetch failed for %s: %s", year, e)
        return None
    events: list[EventInfo] = []
    for rnd in sorted({int(r) for r in sched["RoundNumber"] if int(r) != 0}):
        info = _event_info(rnd, sched.get_event_by_round(rnd))
        if info is not None:
            events.append(info)
    if not events:
        return None
    return derive_calendar(events, now, year)
