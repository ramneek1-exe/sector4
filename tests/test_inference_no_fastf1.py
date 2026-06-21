"""Design §5 guarantee: importing the inference package must not import fastf1.

This is what keeps the eventual /api/ serverless functions free of fastf1 and the
~225M cache — they ship only the small feature table. The sklearn guard below
additionally keeps the lookup path light enough to fit Vercel's 500MB Python
Lambda limit (pace/strategy pull scikit-learn; lookup must not).
"""
import importlib
import os
import subprocess
import sys


def test_importing_inference_does_not_import_fastf1():
    # Drop any prior import of fastf1 and the inference modules, then re-import.
    for name in list(sys.modules):
        if name == "fastf1" or name.startswith("fastf1."):
            del sys.modules[name]
    for name in ["src.inference", "src.inference.lookup",
                 "src.inference.pace", "src.inference.strategy",
                 "src.inference.podium"]:
        sys.modules.pop(name, None)

    importlib.import_module("src.inference")

    leaked = [m for m in sys.modules if m == "fastf1" or m.startswith("fastf1.")]
    assert leaked == [], f"inference pulled in fastf1: {leaked}"


def test_public_callables_are_exported():
    import src.inference as inf
    assert hasattr(inf, "lookup_stat")
    assert hasattr(inf, "predict_pace_gaps")
    assert hasattr(inf, "predict_stop_counts")
    assert hasattr(inf, "predict_podium")


def test_lookup_path_does_not_import_sklearn_or_fastf1():
    # Fresh interpreter: importing only the lookup path (what the Vercel function
    # loads) must not drag in scikit-learn or fastf1, so the function stays small.
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    code = (
        "import sys\n"
        "from src.inference.lookup import lookup_stat\n"
        "lookup_stat('pit_loss', 'Monaco')\n"
        "bad = [m for m in sys.modules if m.split('.')[0] in ('sklearn', 'fastf1')]\n"
        "assert not bad, bad\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=repo_root, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr


def test_deg_lookup_path_does_not_import_sklearn_or_fastf1():
    # The deg/stint lookup reads the strategy parquet but must stay sklearn/fastf1-free.
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    code = (
        "import sys, pandas as pd\n"
        "from src.inference.lookup import lookup_stat\n"
        "t = pd.DataFrame({'gp':['Bahrain'],'deg_overall':[0.1],'feas_max_stint':[20]})\n"
        "lookup_stat('tyre_deg', 'Bahrain', table=t)\n"
        "bad = [m for m in sys.modules if m.split('.')[0] in ('sklearn', 'fastf1')]\n"
        "assert not bad, bad\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=repo_root, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr


def test_podium_path_does_not_import_fastf1():
    # Fresh interpreter: importing + calling the podium path must not pull fastf1.
    repo_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    code = (
        "import sys\n"
        "from src.inference.podium import predict_podium\n"
        "bad = [m for m in sys.modules if m == 'fastf1' or m.startswith('fastf1.')]\n"
        "assert not bad, bad\n"
    )
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=repo_root, capture_output=True, text=True
    )
    assert result.returncode == 0, result.stderr
