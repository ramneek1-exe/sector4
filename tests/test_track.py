"""Tests for track-intrinsic features (spike Step 4)."""
import pytest

from src.features.track import track_features, TRACK_FEATURE_COLS


def test_known_track_returns_all_feature_columns():
    feats = track_features("Bahrain")
    for col in TRACK_FEATURE_COLS:
        assert col in feats
        assert isinstance(feats[col], (int, float))


def test_distinct_tracks_have_distinct_profiles():
    monza = track_features("Italy")       # low-deg, low-downforce
    bahrain = track_features("Bahrain")   # high-deg, abrasive
    assert monza["abrasiveness"] < bahrain["abrasiveness"]
    assert monza["length_km"] > bahrain["length_km"]  # Monza is the longer lap


def test_unknown_track_returns_neutral_defaults_not_crash():
    feats = track_features("Nowhere GP")
    for col in TRACK_FEATURE_COLS:
        assert col in feats


def test_curated_tracks_are_the_explicit_track_keys():
    from src.features.track import CURATED_TRACKS, _TRACKS
    assert CURATED_TRACKS == frozenset(_TRACKS)
    assert "Monaco" in CURATED_TRACKS
    assert "Imola" not in CURATED_TRACKS


def test_austria_curated():
    from src.features.track import CURATED_TRACKS
    assert "Austria" in CURATED_TRACKS
    f = track_features("Austria")
    assert f["length_km"] == 4.318
    assert f["pit_loss_s"] == 20.3


def test_britain_curated():
    from src.features.track import CURATED_TRACKS
    assert "Great Britain" in CURATED_TRACKS
    f = track_features("Great Britain")
    assert f["length_km"] == 5.891
