"""load_qualifying_grid — parse the quali classification into {driver: position}.

The grid only exists once quali has run; fastf1 returns empty results for a future
session and may raise on I/O issues. Both must degrade to an empty grid so the caller
falls back to honest Friday mode rather than a fake grid (M6 pre-work). Pure unit test
via a fake session — no fastf1 I/O.
"""
from __future__ import annotations

import pandas as pd
import pytest

import src.data.grid as grid_mod
from src.data.grid import load_qualifying_grid


class _FakeSession:
    def __init__(self, results, date=None):
        self._results = results
        self.date = date
        self.loaded = False

    def load(self, **kwargs):  # fastf1 contract: completes even when data is missing
        self.loaded = True

    @property
    def results(self):
        if isinstance(self._results, Exception):
            raise self._results
        return self._results


@pytest.fixture(autouse=True)
def _no_cache(monkeypatch):
    monkeypatch.setattr(grid_mod, "enable_cache", lambda *a, **k: None)


def _patch_session(monkeypatch, session):
    monkeypatch.setattr(grid_mod.fastf1, "get_session", lambda *a, **k: session)


def test_parses_classification_into_driver_position_map(monkeypatch):
    results = pd.DataFrame(
        {"Abbreviation": ["RUS", "LEC", "HAM"], "Position": [1.0, 2.0, 3.0]}
    )
    _patch_session(monkeypatch, _FakeSession(results))
    assert load_qualifying_grid(2026, "Austria") == {"RUS": 1, "LEC": 2, "HAM": 3}


def test_empty_when_qualifying_not_run(monkeypatch):
    _patch_session(monkeypatch, _FakeSession(pd.DataFrame()))
    assert load_qualifying_grid(2026, "Austria") == {}


def test_empty_when_get_session_raises(monkeypatch):
    def boom(*a, **k):
        raise RuntimeError("api down")
    monkeypatch.setattr(grid_mod.fastf1, "get_session", boom)
    assert load_qualifying_grid(2026, "Austria") == {}


def test_empty_when_qualifying_is_in_the_future(monkeypatch):
    # fastf1 leaks a future session's classification; the date-gate must reject it
    # BEFORE loading so a premature grid never reaches grids.json.
    results = pd.DataFrame({"Abbreviation": ["RUS"], "Position": [1.0]})
    fake = _FakeSession(results, date=pd.Timestamp("2999-01-01 00:00"))
    _patch_session(monkeypatch, fake)
    assert load_qualifying_grid(2026, "Austria") == {}
    assert fake.loaded is False  # gated BEFORE loading the leaked data


def test_loads_when_qualifying_already_run(monkeypatch):
    # a past-dated session is NOT gated (regression guard for the date check)
    results = pd.DataFrame({"Abbreviation": ["RUS", "LEC"], "Position": [1.0, 2.0]})
    fake = _FakeSession(results, date=pd.Timestamp("2020-01-01 00:00"))
    _patch_session(monkeypatch, fake)
    assert load_qualifying_grid(2026, "Austria") == {"RUS": 1, "LEC": 2}
    assert fake.loaded is True


def test_skips_rows_with_missing_position(monkeypatch):
    results = pd.DataFrame(
        {"Abbreviation": ["RUS", "DNF"], "Position": [1.0, float("nan")]}
    )
    _patch_session(monkeypatch, _FakeSession(results))
    assert load_qualifying_grid(2026, "Austria") == {"RUS": 1}
