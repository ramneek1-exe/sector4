"""Tests for recency sample-weights (M5)."""
import numpy as np
import pandas as pd

from src.inference.weights import recency_weights


def test_same_year_weight_is_one():
    prior = pd.DataFrame({"year": [2026, 2026]})
    w = recency_weights(prior, target_year=2026)
    assert np.allclose(w, [1.0, 1.0])


def test_older_seasons_decay_with_half_life():
    prior = pd.DataFrame({"year": [2024, 2026]})
    w = recency_weights(prior, target_year=2026, half_life_years=2.0)
    # 2024 is 2 years back -> exactly half; 2026 -> full.
    assert np.allclose(w, [0.5, 1.0])


def test_alignment_to_row_order():
    prior = pd.DataFrame({"year": [2026, 2023]})
    w = recency_weights(prior, target_year=2026, half_life_years=1.0)
    assert w[0] == 1.0 and w[1] < w[0]


def test_future_rows_never_up_weight():
    prior = pd.DataFrame({"year": [2027, 2026]})
    w = recency_weights(prior, target_year=2026, half_life_years=1.0)
    assert np.allclose(w, [1.0, 1.0])
