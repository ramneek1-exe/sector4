"""Design §5 guarantee: importing the inference package must not import fastf1.

This is what keeps the eventual /api/ serverless functions free of fastf1 and the
~225M cache — they ship only the small feature table.
"""
import importlib
import sys


def test_importing_inference_does_not_import_fastf1():
    # Drop any prior import of fastf1 and the inference modules, then re-import.
    for name in list(sys.modules):
        if name == "fastf1" or name.startswith("fastf1."):
            del sys.modules[name]
    for name in ["src.inference", "src.inference.lookup",
                 "src.inference.pace", "src.inference.strategy"]:
        sys.modules.pop(name, None)

    importlib.import_module("src.inference")

    leaked = [m for m in sys.modules if m == "fastf1" or m.startswith("fastf1.")]
    assert leaked == [], f"inference pulled in fastf1: {leaked}"


def test_public_callables_are_exported():
    import src.inference as inf
    assert hasattr(inf, "lookup_stat")
    assert hasattr(inf, "predict_pace_gaps")
    assert hasattr(inf, "predict_stop_counts")
