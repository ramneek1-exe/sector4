import pandas as pd

import src.data.results as results


class _FakeSession:
    def __init__(self, date, res):
        self.date = date
        self._res = res

    def load(self, **kw):
        pass

    @property
    def results(self):
        return self._res


def _sprint_res(points):
    return pd.DataFrame({"Abbreviation": list(points), "Points": list(points.values())})


def test_sprint_points_returns_driver_points(monkeypatch):
    fake = _FakeSession(pd.Timestamp("2026-07-05 10:00"), _sprint_res({"VER": 8.0, "NOR": 7.0}))
    monkeypatch.setattr(results.fastf1, "get_session", lambda *a, **k: fake)
    assert results._sprint_points(2026, 9) == {"VER": 8.0, "NOR": 7.0}


def test_sprint_points_empty_when_no_sprint(monkeypatch):
    def _raise(*a, **k):
        raise ValueError("no Sprint session this weekend")
    monkeypatch.setattr(results.fastf1, "get_session", _raise)
    assert results._sprint_points(2026, 3) == {}


def test_sprint_points_empty_when_future(monkeypatch):
    fake = _FakeSession(pd.Timestamp("2999-01-01 00:00"), _sprint_res({"VER": 8.0}))
    monkeypatch.setattr(results.fastf1, "get_session", lambda *a, **k: fake)
    assert results._sprint_points(2026, 9) == {}
