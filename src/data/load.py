"""fastf1 session loading wrappers (spike Step 0).

Caching is mandatory and aggressive (CLAUDE.md / brief): enable the cache once,
never refetch a session already on disk. All loads are wrapped so a missing or
broken session degrades to None rather than crashing a multi-weekend build.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

import fastf1
import pandas as pd

logger = logging.getLogger(__name__)

_CACHE_ENABLED = False


def _to_naive_utc(ts) -> pd.Timestamp:
    t = pd.Timestamp(ts)
    return t.tz_convert("UTC").tz_localize(None) if t.tzinfo is not None else t


def session_in_future(dt, now=None) -> bool:
    """True when a session's scheduled datetime is later than `now` (UTC).

    fastf1 exposes future/other sessions and returns leaked laps for them, so a date check
    is the only safe occurred-gate. Unknown dates (None/NaT) are NOT gated (fall through to
    the existing no-laps check).
    """
    if dt is None or pd.isna(dt):
        return False
    if now is None:
        now = datetime.now(timezone.utc)
    return _to_naive_utc(dt) > _to_naive_utc(now)


def enable_cache(path: str = "cache/") -> None:
    """Enable the fastf1 cache (idempotent). Creates the dir if missing."""
    global _CACHE_ENABLED
    if _CACHE_ENABLED:
        return
    os.makedirs(path, exist_ok=True)
    fastf1.Cache.enable_cache(path)
    _CACHE_ENABLED = True


def load_session(year: int, gp: str, session: str, **load_kwargs):
    """Load a session with telemetry off by default (we only need laps/weather).

    Returns the loaded session, or None if loading fails (e.g. session not held,
    data not yet published, API hiccup).
    """
    enable_cache()
    kwargs = {"laps": True, "telemetry": False, "weather": True, "messages": False}
    kwargs.update(load_kwargs)
    try:
        s = fastf1.get_session(year, gp, session)
        if session_in_future(getattr(s, "date", None)):
            logger.info("Skipping %s %s %s: session not yet held (future date)", year, gp, session)
            return None
        s.load(**kwargs)
        # fastf1 does NOT raise for a future/unpublished race — load() completes with
        # zero drivers and accessing .laps then raises. Force the check here so such a
        # session degrades to None (the documented contract) instead of crashing a
        # full-calendar build downstream. (The .laps access raises -> caught below.)
        if kwargs.get("laps", True) and (s.laps is None or s.laps.empty):
            logger.warning("Loaded %s %s %s but it has no laps; treating as unavailable",
                           year, gp, session)
            return None
        return s
    except Exception as e:  # noqa: BLE001 - want any failure to degrade gracefully
        logger.warning("Failed to load %s %s %s: %s", year, gp, session, e)
        return None


def is_dry_session(session) -> bool:
    """True if no rainfall recorded — used to screen out wet/unusable sessions."""
    try:
        weather = session.weather_data
        if weather is None or weather.empty:
            return True  # no data: assume dry, the lap pipeline will filter noise
        return not bool(weather["Rainfall"].any())
    except Exception:  # noqa: BLE001
        return True
