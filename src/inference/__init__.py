"""Public inference surface (M1).

Lazy on purpose: importing one capability must not pull in the others' heavy
deps. In particular the `lookup_stat` path must stay free of scikit-learn (which
pace/strategy require) so the Vercel Python function that only does lookups fits
the 500MB Lambda limit. Eager `from .pace/.strategy import ...` here would defeat
that — accessing pace/strategy below imports them only on first use. Imports
stay fastf1-free either way (enforced by tests/test_inference_no_fastf1.py).
"""
__all__ = ["lookup_stat", "predict_pace_gaps", "predict_stop_counts", "predict_podium"]


def __getattr__(name: str):
    if name == "lookup_stat":
        from src.inference.lookup import lookup_stat
        return lookup_stat
    if name == "predict_pace_gaps":
        from src.inference.pace import predict_pace_gaps
        return predict_pace_gaps
    if name == "predict_stop_counts":
        from src.inference.strategy import predict_stop_counts
        return predict_stop_counts
    if name == "predict_podium":
        from src.inference.podium import predict_podium
        return predict_podium
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
