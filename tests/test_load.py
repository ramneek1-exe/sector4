"""load_session robustness — a session that loads but has no laps is unavailable.

fastf1's Session.load() does NOT raise for a future/unpublished race; it completes
with zero drivers, then accessing .laps raises DataNotLoadedError. load_session must
degrade that to None (its documented contract) so a full-calendar build skips future
weekends instead of crashing (M5). Pure unit test via a fake session — no fastf1 I/O.
"""
from __future__ import annotations

import pandas as pd
import pytest

import src.data.load as load_mod
from src.data.load import load_session


class _FakeSession:
    def __init__(self, laps):
        self._laps = laps

    def load(self, **kwargs):  # fastf1 contract: completes even when data is missing
        return None

    @property
    def laps(self):
        if isinstance(self._laps, Exception):
            raise self._laps
        return self._laps


@pytest.fixture(autouse=True)
def _no_cache(monkeypatch):
    # Skip real fastf1 cache setup in unit tests.
    monkeypatch.setattr(load_mod, "enable_cache", lambda *a, **k: None)


def _patch_session(monkeypatch, session):
    monkeypatch.setattr(load_mod.fastf1, "get_session", lambda *a, **k: session)


def test_returns_session_when_laps_present(monkeypatch):
    s = _FakeSession(pd.DataFrame({"LapTime": [1.0, 2.0]}))
    _patch_session(monkeypatch, s)
    assert load_session(2025, "Austria", "R") is s


def test_none_when_load_succeeds_but_laps_unloaded(monkeypatch):
    from fastf1.exceptions import DataNotLoadedError
    _patch_session(monkeypatch, _FakeSession(DataNotLoadedError("not loaded")))
    assert load_session(2026, "Abu Dhabi", "R") is None


def test_none_when_laps_empty(monkeypatch):
    _patch_session(monkeypatch, _FakeSession(pd.DataFrame()))
    assert load_session(2026, "Qatar", "R") is None


def test_none_when_get_session_raises(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("api down")
    monkeypatch.setattr(load_mod.fastf1, "get_session", boom)
    assert load_session(2026, "Austria", "R") is None
