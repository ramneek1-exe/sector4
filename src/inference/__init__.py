"""Public inference surface (M1). Imports here must stay fastf1-free (design §5)."""
from src.inference.lookup import lookup_stat
from src.inference.pace import predict_pace_gaps
from src.inference.strategy import predict_stop_counts

__all__ = ["lookup_stat", "predict_pace_gaps", "predict_stop_counts"]
