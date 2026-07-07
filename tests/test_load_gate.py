from datetime import datetime, timezone

import pandas as pd

import src.data.load as load
from src.data.load import session_in_future


NOW = datetime(2026, 7, 6, tzinfo=timezone.utc)


def test_session_in_future_gates_only_future_dates():
    assert session_in_future(pd.Timestamp("2026-07-19 13:00"), now=NOW) is True   # future race
    assert session_in_future(pd.Timestamp("2026-07-05 14:00"), now=NOW) is False  # already run
    assert session_in_future(None, now=NOW) is False                              # unknown -> not gated
    assert session_in_future(pd.NaT, now=NOW) is False


def test_session_in_future_normalizes_tz_aware_dates():
    aware = pd.Timestamp("2026-07-19 13:00", tz="UTC")
    assert session_in_future(aware, now=NOW) is True


class _FakeSession:
    def __init__(self, date):
        self.date = date
        self.loaded = False

    def load(self, **kw):
        self.loaded = True
        # a leaked future session would still expose laps here
        self.laps = pd.DataFrame({"Driver": ["VER"]})


def test_load_session_skips_a_future_dated_session(monkeypatch):
    fake = _FakeSession(pd.Timestamp("2999-01-01 00:00"))
    monkeypatch.setattr(load.fastf1, "get_session", lambda *a, **k: fake)
    out = load.load_session(2026, "Belgium", "R")
    assert out is None
    assert fake.loaded is False  # gated BEFORE loading the leaked data
