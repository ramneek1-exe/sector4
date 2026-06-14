"""Tests for evaluation metrics (Model A vs baseline).

Convention throughout: pace values are deltas in seconds/lap where LOWER = FASTER.
So the predicted/actual "order" is the ascending sort of the pace values.
"""
import numpy as np
import pytest

from src.eval.metrics import pace_mae, spearman_rho, top3_accuracy, evaluate_predictions


def test_pace_mae_basic():
    y_true = [0.0, 0.5, 1.0]
    y_pred = [0.1, 0.5, 0.8]
    # abs errors: 0.1, 0.0, 0.2 -> mean 0.1
    assert pace_mae(y_true, y_pred) == pytest.approx(0.1)


def test_spearman_rho_perfect_order():
    # pred preserves the ordering of true (monotonic) -> rho == 1
    y_true = [0.0, 0.3, 0.6, 0.9]
    y_pred = [1.0, 2.0, 3.0, 4.0]
    assert spearman_rho(y_true, y_pred) == pytest.approx(1.0)


def test_spearman_rho_reversed_order():
    y_true = [0.0, 0.3, 0.6, 0.9]
    y_pred = [4.0, 3.0, 2.0, 1.0]
    assert spearman_rho(y_true, y_pred) == pytest.approx(-1.0)


def test_top3_accuracy_all_correct():
    # fastest three (smallest values) identical between true and pred -> 1.0
    y_true = [0.0, 0.1, 0.2, 1.0, 2.0]
    y_pred = [0.05, 0.15, 0.25, 0.9, 1.5]
    assert top3_accuracy(y_true, y_pred) == pytest.approx(1.0)


def test_top3_accuracy_partial_overlap():
    # actual podium = drivers {0,1,2}; predicted podium = {0,1,3} -> overlap 2/3
    y_true = [0.0, 0.1, 0.2, 0.3, 0.4]
    y_pred = [0.0, 0.1, 0.4, 0.2, 0.5]
    assert top3_accuracy(y_true, y_pred) == pytest.approx(2.0 / 3.0)


def test_top3_accuracy_none_correct():
    y_true = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5]
    y_pred = [0.5, 0.4, 0.3, 0.0, 0.1, 0.2]  # predicted podium = {3,4,5}
    assert top3_accuracy(y_true, y_pred) == pytest.approx(0.0)


def test_evaluate_predictions_uses_pace_for_mae_and_finish_for_ranking():
    # MAE pools predicted vs actual PACE; top3/rho compare the predicted pace
    # order against the actual FINISHING order (the real podium).
    race_a = {
        "pace_true": np.array([0.0, 0.5, 1.0]),
        "pace_pred": np.array([0.0, 0.5, 1.0]),
        "finish_pos": np.array([1, 2, 3]),
    }
    race_b = {
        "pace_true": np.array([0.0, 0.5, 1.0]),
        "pace_pred": np.array([1.0, 0.5, 0.0]),  # reversed vs pace & finish
        "finish_pos": np.array([1, 2, 3]),
    }
    out = evaluate_predictions([race_a, race_b])
    assert out["mae"] == pytest.approx((0 + 0 + 0 + 1.0 + 0 + 1.0) / 6)
    # rho(finish, pred): race_a +1, race_b -1 -> mean 0
    assert out["spearman"] == pytest.approx(0.0)
    # only 3 drivers -> predicted top3 always contains the podium
    assert out["top3"] == pytest.approx(1.0)
    assert out["n_races"] == 2


def test_evaluate_predictions_ranking_truth_is_finishing_order():
    # Pace prediction is perfect, but the winner DNF'd (finished P5).
    # top3 should drop because the actual podium != predicted-by-pace podium.
    race = {
        "pace_true": np.array([0.0, 0.1, 0.2, 0.3, 0.4]),
        "pace_pred": np.array([0.0, 0.1, 0.2, 0.3, 0.4]),
        "finish_pos": np.array([5, 1, 2, 3, 4]),  # fastest car classified P5
    }
    out = evaluate_predictions([race])
    # predicted podium = drivers {0,1,2}; actual podium = {1,2,3} -> overlap 2/3
    assert out["top3"] == pytest.approx(2.0 / 3.0)
