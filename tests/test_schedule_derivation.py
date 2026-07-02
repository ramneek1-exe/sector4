"""Unit tests for the pure calendar-derivation core (no fastf1)."""
import pandas as pd
import pytest

from src.data.schedule import EventInfo, derive_calendar, pre_quali_time

TS = pd.Timestamp
NAME_TO_KEY = {"Alpha Grand Prix": "Alpha", "Bravo Grand Prix": "Bravo",
               "Charlie Grand Prix": "Charlie", "Delta Grand Prix": "Delta"}


def _ev(rnd, name, race_day):
    race = TS(f"2026-{race_day}T14:00:00")
    return EventInfo(rnd, name, race, race - pd.Timedelta(days=1), race - pd.Timedelta(days=2))


def test_pre_quali_time_picks_last_session_before_quali():
    quali = TS("2026-05-02T15:00:00")
    sess = [TS("2026-05-01T11:00:00"), TS("2026-05-01T15:00:00"),
            TS("2026-05-02T11:00:00"), quali, TS("2026-05-03T14:00:00")]
    assert pre_quali_time(sess, quali) == TS("2026-05-02T11:00:00")


def test_pre_quali_time_falls_back_when_nothing_before_quali():
    quali = TS("2026-05-02T15:00:00")
    assert pre_quali_time([None, quali], quali) == quali - pd.Timedelta(hours=3)


def test_mid_season_completed_plus_single_target():
    events = [_ev(1, "Alpha Grand Prix", "03-08"), _ev(2, "Bravo Grand Prix", "03-15"),
              _ev(3, "Charlie Grand Prix", "03-29"), _ev(4, "Delta Grand Prix", "04-12")]
    now = TS("2026-03-20T00:00:00")  # after Alpha+Bravo, before Charlie
    out = derive_calendar(events, now, 2026, NAME_TO_KEY)
    assert out["calendar"] == ["Alpha", "Bravo", "Charlie"]  # completed + single target
    assert out["schedule"]["gp"] == "Charlie"
    assert out["schedule"]["nextGp"] == "Delta"
    assert out["schedule"]["year"] == 2026
    assert out["schedule"]["final"] == "2026-03-29T14:00:00Z"


def test_pre_season_target_is_round_one():
    events = [_ev(1, "Alpha Grand Prix", "03-08"), _ev(2, "Bravo Grand Prix", "03-15")]
    out = derive_calendar(events, TS("2026-01-01T00:00:00"), 2026, NAME_TO_KEY)
    assert out["calendar"] == ["Alpha"]
    assert out["schedule"]["gp"] == "Alpha"
    assert out["schedule"]["nextGp"] == "Bravo"


def test_post_season_target_is_finale_no_next():
    events = [_ev(1, "Alpha Grand Prix", "03-08"), _ev(2, "Bravo Grand Prix", "03-15")]
    out = derive_calendar(events, TS("2026-12-31T00:00:00"), 2026, NAME_TO_KEY)
    assert out["calendar"] == ["Alpha", "Bravo"]  # all completed, no dup of target
    assert out["schedule"]["gp"] == "Bravo"
    assert out["schedule"]["nextGp"] is None


def test_unknown_event_is_skipped():
    events = [_ev(1, "Alpha Grand Prix", "03-08"),
              _ev(2, "Unlisted Grand Prix", "03-15"),
              _ev(3, "Bravo Grand Prix", "03-29")]
    out = derive_calendar(events, TS("2026-04-01T00:00:00"), 2026, NAME_TO_KEY)
    assert out["calendar"] == ["Alpha", "Bravo"]  # Unlisted dropped, not crashed
