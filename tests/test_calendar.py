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


def test_2026_austria_is_last_and_after_every_prior_season():
    order = calendar_order()
    austria = race_id(2026, "Austria")
    # Austria is the final 2026 round we list, so it is the last element overall.
    assert order[-1] == austria
    # Every 2026 race sits after every 2025 race (true calendar order, no leakage).
    first_2026 = min(i for i, r in enumerate(order) if r.startswith("2026-"))
    last_2025 = max(i for i, r in enumerate(order) if r.startswith("2025-"))
    assert first_2026 > last_2025


def test_gp_to_event_covers_every_calendar_circuit():
    # Every circuit key referenced by RACE_CALENDAR must map to a results EventName.
    for circuits in RACE_CALENDAR.values():
        for gp in circuits:
            assert gp in GP_TO_EVENT, f"{gp} missing from GP_TO_EVENT"
            assert GP_TO_EVENT[gp].endswith("Grand Prix")
