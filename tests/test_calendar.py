# tests/test_calendar.py
"""Tests for canonical calendar ordering (M1, extended for 2026 in M5)."""
from src.calendar import (
    DRY_CIRCUITS,
    GP_TO_EVENT,
    RACE_CALENDAR,
    SEASONS,
    calendar_order,
    race_id,
)
from src.features.actual_stops import STOPS_CIRCUITS


def test_race_id_format():
    assert race_id(2024, "Bahrain") == "2024-Bahrain"


def test_calendar_order_is_year_major_then_circuit_order():
    order = calendar_order(seasons=[2023, 2024], circuits=["Bahrain", "Spain"])
    assert order == ["2023-Bahrain", "2023-Spain", "2024-Bahrain", "2024-Spain"]


def test_calendar_order_not_alphabetical():
    # Abu Dhabi sorts before Bahrain alphabetically but is raced LAST in a season;
    # calendar order must keep it after Bahrain (the exact leakage trap).
    order = calendar_order(seasons=[2024])
    assert order.index("2024-Bahrain") < order.index("2024-Abu Dhabi")


def test_validation_dry_set_unchanged():
    # The dry validation set + its explicit-args calendar_order is unchanged.
    assert len(DRY_CIRCUITS) == 8
    assert SEASONS == [2023, 2024, 2025]
    assert len(calendar_order(seasons=SEASONS, circuits=DRY_CIRCUITS)) == 24


def test_default_calendar_order_flattens_race_calendar_with_2026():
    order = calendar_order()
    # Default now spans RACE_CALENDAR (2023-25 dry set + the real 2026 rounds).
    expected = sum(len(c) for c in RACE_CALENDAR.values())
    assert len(order) == expected
    assert 2026 in RACE_CALENDAR
    assert race_id(2026, "Austria") in order


def test_2026_rounds_follow_2025_and_end_at_the_current_target():
    order = calendar_order()
    first_2026 = min(i for i, r in enumerate(order) if r.startswith("2026-"))
    last_2025 = max(i for i, r in enumerate(order) if r.startswith("2025-"))
    assert first_2026 > last_2025  # true calendar order, no leakage
    # The last listed 2026 round is whatever the current target is (data-driven).
    assert order[-1] == race_id(2026, RACE_CALENDAR[2026][-1])


def test_gp_to_event_covers_every_calendar_circuit():
    # Every circuit key referenced by RACE_CALENDAR must map to a results EventName.
    for circuits in RACE_CALENDAR.values():
        for gp in circuits:
            assert gp in GP_TO_EVENT, f"{gp} missing from GP_TO_EVENT"
            assert GP_TO_EVENT[gp].endswith("Grand Prix")


def test_full_2026_roster_is_mappable():
    # Every circuit we sweep for actual stops must resolve to a fastf1 EventName.
    for gp in STOPS_CIRCUITS:
        assert gp in GP_TO_EVENT, f"{gp} missing from GP_TO_EVENT"
    # The roster covers the whole season (>= 22), including rounds not yet run.
    assert len(STOPS_CIRCUITS) >= 22
    for gp in ("Belgium", "Netherlands", "Singapore", "Qatar"):
        assert gp in STOPS_CIRCUITS


def test_race_calendar_2026_is_a_contiguous_schedule_prefix():
    # The derived live calendar is always completed-rounds + the single target, i.e. a
    # contiguous prefix of the real schedule order (STOPS_CIRCUITS). It must never skip a
    # round or reach past the target into the future (the fastf1 future-leak guard).
    cal = RACE_CALENDAR[2026]
    assert cal == STOPS_CIRCUITS[: len(cal)]
    assert len(cal) >= 8  # at least through Austria (already run)


# Loader tests
from pathlib import Path

from src.calendar import _FALLBACK_2026, _load_2026


def test_load_2026_reads_valid_json(tmp_path):
    p = tmp_path / "race_calendar.json"
    p.write_text('{"2026": ["Australia", "China", "Japan"]}')
    assert _load_2026(p) == ["Australia", "China", "Japan"]


def test_load_2026_falls_back_when_missing(tmp_path):
    assert _load_2026(tmp_path / "nope.json") == _FALLBACK_2026


def test_load_2026_falls_back_on_corrupt_json(tmp_path):
    p = tmp_path / "race_calendar.json"
    p.write_text("{not json")
    assert _load_2026(p) == _FALLBACK_2026
