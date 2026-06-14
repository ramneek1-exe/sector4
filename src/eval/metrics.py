"""Evaluation metrics for Model A and the baselines.

Pace convention: values are deltas in seconds/lap, LOWER = FASTER. A driver's
finishing order is therefore the ascending sort of their pace value.

- pace_mae: pooled across all rows (engineering metric, PRD §5)
- top3_accuracy: per-race overlap of predicted vs actual podium (product metric)
- spearman_rho: per-race rank correlation of predicted vs actual order (honesty)
"""
from __future__ import annotations

import numpy as np
from scipy.stats import spearmanr


def pace_mae(y_true, y_pred) -> float:
    """Mean absolute error in s/lap."""
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    return float(np.mean(np.abs(y_true - y_pred)))


def spearman_rho(y_true, y_pred) -> float:
    """Spearman rank correlation between true and predicted pace for one race.

    Both inputs use the lower=faster convention, so a model that ranks drivers
    correctly yields rho -> +1.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    rho, _ = spearmanr(y_true, y_pred)
    return float(rho)


def top3_accuracy(y_true, y_pred) -> float:
    """Fraction of the actual podium (3 fastest by y_true) captured in the
    predicted podium (3 fastest by y_pred), for a single race.

    Overlap-based: matches the ~50-55% grid-baseline figure in PRD §5, which is
    "how many of the 3 podium slots did we get", not strict all-three.
    """
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    k = min(3, len(y_true))
    actual_top = set(np.argsort(y_true, kind="stable")[:k])
    pred_top = set(np.argsort(y_pred, kind="stable")[:k])
    return len(actual_top & pred_top) / k


def evaluate_predictions(races) -> dict:
    """Aggregate the three spike metrics over a list of per-race dicts.

    Each race dict has:
      - pace_true:  actual race-pace delta per driver (lower = faster)
      - pace_pred:  predicted race-pace delta per driver
      - finish_pos: actual finishing position per driver (P1 = 1)

    MAE is pooled over every driver-row and judged on PACE. top3 and Spearman
    are per-race (then averaged) and judged on the actual FINISHING order: the
    predicted podium is the 3 fastest by pace_pred, the real podium is the 3
    classified ahead. This keeps the product metric honest about DNFs/strategy.
    """
    all_true, all_pred = [], []
    rhos, top3s = [], []
    for r in races:
        pace_true = np.asarray(r["pace_true"], dtype=float)
        pace_pred = np.asarray(r["pace_pred"], dtype=float)
        finish_pos = np.asarray(r["finish_pos"], dtype=float)
        all_true.append(pace_true)
        all_pred.append(pace_pred)
        rhos.append(spearman_rho(finish_pos, pace_pred))
        top3s.append(top3_accuracy(finish_pos, pace_pred))
    return {
        "mae": pace_mae(np.concatenate(all_true), np.concatenate(all_pred)),
        "spearman": float(np.mean(rhos)),
        "top3": float(np.mean(top3s)),
        "n_races": len(races),
    }
