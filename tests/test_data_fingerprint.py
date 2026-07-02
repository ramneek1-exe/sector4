import pandas as pd

from scripts.data_fingerprint import fingerprint_table


def test_row_order_does_not_change_fingerprint():
    a = pd.DataFrame({"race_id": ["x", "y"], "v": [1.0, 2.0]})
    b = a.iloc[::-1].reset_index(drop=True)
    assert fingerprint_table(a) == fingerprint_table(b)


def test_column_order_does_not_change_fingerprint():
    a = pd.DataFrame({"race_id": ["x"], "v": [1.0]})
    b = a[["v", "race_id"]]
    assert fingerprint_table(a) == fingerprint_table(b)


def test_changed_value_changes_fingerprint():
    a = pd.DataFrame({"race_id": ["x"], "v": [1.0]})
    b = pd.DataFrame({"race_id": ["x"], "v": [1.1]})
    assert fingerprint_table(a) != fingerprint_table(b)
