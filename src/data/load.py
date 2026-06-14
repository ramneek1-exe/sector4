"""fastf1 session loading wrappers (spike Step 0).

Caching is mandatory and aggressive (CLAUDE.md / brief): enable the cache once,
never refetch a session already on disk. All loads are wrapped so a missing or
broken session degrades to None rather than crashing a multi-weekend build.
"""
from __future__ import annotations

import logging
import os

import fastf1

logger = logging.getLogger(__name__)

_CACHE_ENABLED = False


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
        s.load(**kwargs)
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
