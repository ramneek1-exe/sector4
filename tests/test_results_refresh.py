"""load_results live-season refresh hook (M5 R8)."""
import inspect

from src.data import results


def test_load_results_supports_refresh_year():
    sig = inspect.signature(results.load_results)
    assert "refresh_year" in sig.parameters
