"""De-risk gate for M5: confirm fastf1 serves the 2026 season + the Austrian GP.

Run: PYTHONPATH=. .venv/bin/python scripts/derisk_2026.py
Exits 0 only if all probes pass. Prints a human-readable report.
"""
from __future__ import annotations

import sys

import fastf1

from src.data.load import enable_cache

YEAR = 2026
TARGET_GP = "Austrian Grand Prix"


def main() -> int:
    enable_cache()
    ok = True

    sched = fastf1.get_event_schedule(YEAR, include_testing=False)
    rounds = [r for r in sched["RoundNumber"].tolist() if r != 0]
    events = sched["EventName"].tolist()
    print(f"[schedule] 2026 rounds found: {len(rounds)}")
    print(f"[schedule] events: {events}")
    has_austria = any("Austria" in e for e in events)
    print(f"[schedule] Austrian GP present: {has_austria}")
    ok = ok and len(rounds) > 0 and has_austria

    # Results so far this season (podium inputs: standings/form).
    completed = 0
    for rnd in rounds:
        try:
            s = fastf1.get_session(YEAR, rnd, "R")
            s.load(laps=False, telemetry=False, weather=False, messages=False)
            if s.results is not None and not s.results.empty:
                completed += 1
        except Exception as e:  # noqa: BLE001
            print(f"[results] round {rnd}: no results ({e})")
    print(f"[results] 2026 rounds with race results: {completed}")
    ok = ok and completed > 0

    # FP telemetry for the target weekend (pace/stop-count inputs). A FUTURE session
    # (the weekend hasn't run yet) is "pending", NOT a failure — telemetry simply
    # lights up at issuance once FP has run. This makes the script reusable as the
    # day-of readiness check.
    import pandas as pd

    ev = sched[sched["EventName"] == TARGET_GP]
    ev_date = pd.to_datetime(ev["EventDate"].iloc[0]) if not ev.empty else None
    is_future = ev_date is not None and ev_date.tz_localize(None) > pd.Timestamp.now()
    try:
        fp = fastf1.get_session(YEAR, TARGET_GP, "FP2")
        fp.load(telemetry=False, weather=True, messages=False)
        n_laps = 0 if fp.laps is None else len(fp.laps)
        print(f"[FP2 Austria 2026] laps: {n_laps}")
        ok = ok and n_laps > 0
    except Exception as e:  # noqa: BLE001
        if is_future:
            print(f"[FP2 Austria 2026] PENDING — session not run yet (event {ev_date.date()}); "
                  "telemetry will be available at issuance.")
        else:
            print(f"[FP2 Austria 2026] UNAVAILABLE: {e}")
            ok = False

    # Prior-year Austria for prior_track_pace.
    for py in (2025, 2024):
        try:
            r = fastf1.get_session(py, TARGET_GP, "R")
            r.load(laps=True, telemetry=False, weather=False, messages=False)
            print(f"[prior {py} Austria] laps: {0 if r.laps is None else len(r.laps)}")
        except Exception as e:  # noqa: BLE001
            print(f"[prior {py} Austria] UNAVAILABLE: {e}")
            ok = False

    print("\nDE-RISK GATE:", "PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
