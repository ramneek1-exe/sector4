# tests/test_calendar.py
"""Tests for canonical calendar ordering (M1)."""
from src.calendar import DRY_CIRCUITS, SEASONS, calendar_order, race_id


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


def test_defaults_cover_eight_dry_circuits_three_seasons():
    assert len(DRY_CIRCUITS) == 8
    assert SEASONS == [2023, 2024, 2025]
    assert len(calendar_order()) == 24
