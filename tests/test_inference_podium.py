"""Tests for predict_podium (M3 headline backend; bands + flagged p_podium)."""
import pandas as pd

from src.calendar import DRY_CIRCUITS
from src.inference.podium import predict_podium, FRIDAY_COLS, SATURDAY_COLS


def _podium_table(n_train_weekends=8, with_grid=True):
    """Synthetic table on REAL calendar race_ids so store.prior_weekends (which
    slices in calendar order) recognizes the prior 2023 weekends. champ rank
    strongly predicts podium. `n_train_weekends` prior 2023 circuits (<= 8) precede
    the 2024-Bahrain target."""
    rows = []
    drivers = ["VER", "NOR", "LEC", "HAM", "PIA", "RUS"]
    weekends = [(2023, c) for c in DRY_CIRCUITS[:n_train_weekends]] + [(2024, "Bahrain")]
    for year, gp in weekends:
        for rank, drv in enumerate(drivers, start=1):
            rows.append({
                "race_id": f"{year}-{gp}", "year": year, "gp": gp,
                "Driver": drv, "podium": int(rank <= 3),
                "champ_rank_before": rank, "champ_points_before": 200 - 30 * rank,
                "form_finish_avg3": float(rank), "prior_track_pace": 0.05 * rank,
                "grid_position": rank if with_grid else float("nan"),
                "finish_pos": rank,
            })
    return pd.DataFrame(rows)


def test_predict_podium_returns_sorted_bands_and_flagged_proba():
    out = predict_podium(2024, "Bahrain", table=_podium_table())
    assert out["qualitative"] is True          # bands are the surface
    assert out["calibrated"] is False          # numeric % not trusted yet
    assert out["mode"] == "saturday"           # grid present -> Saturday
    ps = [d["p_podium"] for d in out["drivers"]]
    assert ps == sorted(ps, reverse=True)      # sorted by probability desc
    top = out["drivers"][0]
    assert set(top) == {"driver", "band", "p_podium", "rank"}
    assert top["band"] in {"strong", "in contention", "outside shot"}
    assert top["p_podium"] == round(top["p_podium"], 2)
    assert top["rank"] == 1


def test_mode_auto_picks_friday_when_no_grid():
    out = predict_podium(2024, "Bahrain", table=_podium_table(with_grid=False))
    assert out["mode"] == "friday"


def test_explicit_mode_override_respected():
    out = predict_podium(2024, "Bahrain", mode="friday", table=_podium_table())
    assert out["mode"] == "friday"


def test_explicit_saturday_degrades_to_friday_when_grid_missing():
    # An incomplete grid must not crash predict_proba with a NaN; Saturday needs a
    # complete grid, so it falls back to the pre-grid Friday mode.
    out = predict_podium(2024, "Bahrain", mode="saturday",
                         table=_podium_table(with_grid=False))
    assert out["mode"] == "friday"
    assert out["drivers"]  # produced a real prediction, not a crash


def test_training_slice_excludes_the_target_weekend():
    # Leakage guard: the target weekend's rows must never be in the training data.
    from src import store
    table = _podium_table()
    prior = store.prior_weekends(table, 2024, "Bahrain")
    assert "2024-Bahrain" not in set(prior["race_id"])


def test_empty_target_is_qualitative():
    out = predict_podium(2030, "Narnia", table=_podium_table())
    assert out["qualitative"] is True
    assert out["drivers"] == []
    assert "no feature row" in out["reason"]


def test_sparse_prior_is_qualitative_without_proba():
    out = predict_podium(2024, "Bahrain", table=_podium_table(n_train_weekends=3))
    assert out["qualitative"] is True
    assert out["drivers"] == []
    assert out["n_train_races"] == 3


def test_feature_columns_exclude_finish():
    assert "finish_pos" not in SATURDAY_COLS
    assert "grid_position" in SATURDAY_COLS
    assert "grid_position" not in FRIDAY_COLS
