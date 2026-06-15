# tests/test_store.py
"""Tests for the feature store + leakage-safe prior_weekends slice (M1)."""
import pandas as pd

from src.store import prior_weekends, read_table, write_table


def _table():
    # 2024-Abu Dhabi sorts BEFORE 2024-Bahrain alphabetically but is raced later.
    return pd.DataFrame(
        {
            "race_id": ["2023-Bahrain", "2023-Abu Dhabi",
                        "2024-Bahrain", "2024-Abu Dhabi"],
            "Driver": ["VER", "VER", "VER", "VER"],
            "val": [1, 2, 3, 4],
        }
    )


def test_prior_weekends_excludes_target_and_future():
    prior = prior_weekends(_table(), 2024, "Bahrain")
    ids = set(prior["race_id"])
    assert ids == {"2023-Bahrain", "2023-Abu Dhabi"}  # both 2023 races
    assert "2024-Bahrain" not in ids  # target excluded
    assert "2024-Abu Dhabi" not in ids  # future excluded


def test_prior_weekends_uses_calendar_not_alphabetical_order():
    # Predicting 2024-Bahrain: 2024-Abu Dhabi (alphabetically earlier) must NOT leak.
    prior = prior_weekends(_table(), 2024, "Bahrain")
    assert "2024-Abu Dhabi" not in set(prior["race_id"])


def test_prior_weekends_unknown_target_treats_all_placeable_as_prior():
    # A weekend not on the known calendar (e.g. a future 2026 race) -> all known prior.
    prior = prior_weekends(_table(), 2026, "Bahrain")
    assert len(prior) == 4


def test_write_then_read_roundtrips(tmp_path):
    path = str(tmp_path / "t.parquet")
    df = _table()
    write_table(df, path)
    back = read_table(path)
    pd.testing.assert_frame_equal(back, df)


def test_podium_table_constant_defined():
    from src import store
    assert store.PODIUM_TABLE == "data/podium_features.parquet"
