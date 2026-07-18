# Design — atomic calibration-index rebuild (projection model)

Date: 2026-07-18
Status: approved (owner), ready for implementation plan
Milestone: data-integrity fix for `/accuracy` (root-caused via systematic-debugging after the reconstructed-labeling restamp corrupted the index).

## 0. Problem / root cause

The season calibration index (`calibration/2026-index.json`) is a single Blob key. Today
`writeWeekendSnapshot` updates it as a non-atomic **read-modify-write**: `getJson(index)` →
conditionally push a row → `putJson(index)`. Both the reconciler (internal `for` loop) and the
manual admin backfill (run in a shell loop) call this RMW **once per round**.

Two defects fell out of this, one architectural root:

- **D1 — lost updates.** Vercel Blob reads (`head()` + fetch) are eventually consistent, so in
  a fast loop round B reads the index before round A's write is visible, pushes without A, and
  overwrites A's row. The 2026-07-18 restamp loop dropped Australia / Japan / Canada from the
  index this way (verified: they are absent from `/accuracy`).
- **D2 — guard no-op.** `if (!idx.some((r) => r.gp === gp))` means a forced re-write of a gp
  **already** in the index never updates its row — so the intended `reconstructed` re-stamp was
  a silent no-op for rows that had persisted.

Root: **the index is a shared aggregate mutated row-by-row via non-atomic RMW, executed in
loops over an eventually-consistent store.** Any per-round mutation of it is unsafe.

## 1. Goal

Make the calibration index a **pure projection of the final snapshots, rebuilt in a single
atomic write**, so it can never lose rows and always reflects current snapshot state. Recover
the currently-corrupted prod index. Order rows by calendar/occurrence.

## 2. Non-goals

- No change to how predictions are computed or to leakage guards.
- No `/weekend` changes.
- The `/accuracy` **chart enhancement** ("graph is just a line, needs more info") is a separate
  UX item — logged to backlog, NOT in this slice.
- No new Vercel cron entry (reuse the existing daily cron).

## 3. Snapshots become self-describing; index writes leave `writeWeekendSnapshot`

- `WeekendSnapshot` (app/lib/snapshot.ts) gains `reconstructed?: boolean`.
- `writeWeekendSnapshot` (app/lib/snapshot-write.ts):
  - **Removes the entire calibration-index block** (the `getJson(idxKey)` → guard → push →
    `putJson(idxKey)`). It no longer touches the index at all — this deletes the RMW at its
    source (fixes D1/D2).
  - Still fetches actuals on `final` and stamps `snap.actuals` (unchanged).
  - Stamps `snap.reconstructed = true` when the `reconstructed` option is set (reconciler /
    admin); the live cron due-write leaves it absent. (The `WriteDeps.reconstructed` option
    from the prior slice stays; it now flows onto the SNAPSHOT object instead of the index row.)
  - `computeCalibrationRow` / `seasonIndexKey` imports that become unused here move to the
    rebuild module.

## 4. `rebuildCalibrationIndex` — the sole, atomic index writer

New module `app/lib/calibration-index.ts`:

```ts
export interface RebuildDeps {
  getJson?: <T>(key: string) => Promise<T | null>;
  putJson?: (key: string, value: unknown) => Promise<string>;
}

export async function rebuildCalibrationIndex(
  year: number,
  rounds: string[],       // calendar-ordered gp list (from race_calendar.json[year])
  deps?: RebuildDeps,
): Promise<{ rows: number }>;
```

Logic:
- For each `gp` in `rounds` **in order**: `snap = getJson(snapshotKey(year, gp, "final"))`.
  Skip if no snapshot, or no `snap.actuals`, or `actuals.length === 0` (un-raced / not scored).
- Build the row: `computeCalibrationRow(snap.podium, snap.actuals)` → `{ gp, issuedAt:
  snap.issuedAt, ...cal, ...(snap.reconstructed ? { reconstructed: true } : {}) }`.
- Collect rows in `rounds` order, then `putJson(seasonIndexKey(year), rows)` — **one write**.
- Returns `{ rows: rows.length }` for observability.

Race-free (single write), self-healing (reflects current snapshots), calendar-ordered.

`computeCalibrationRow` (app/lib/actuals.ts) is reused unchanged. The per-gp double-count
concern disappears — a rebuild starts from an empty array each time, so a gp can appear at most
once by construction.

## 5. Callers

- **Cron** (`app/api/cron/snapshot/route.ts`): run rebuild **LAST** — order becomes
  `safeReconcileFinals` → due-checkpoint write (if due) → `rebuildCalibrationIndex(s.year,
  rounds)` — so the rebuild sees BOTH the reconciler's backfills AND a live `final` just written
  by the due-write this same fire (no scoring gap: a live-captured final is scored on the same
  cron run that writes it). Uses the same `rounds` list already derived from `race_calendar.json`.
  Wrap so a rebuild failure is caught and reported, never 500s the route (mirror the
  `safeReconcileFinals` pattern — add `safeRebuildCalibrationIndex` or an inline try/catch).
  Include the result in the response.
- **New admin endpoint** `app/api/admin/rebuild-calibration/route.ts` (CRON_SECRET-gated, like
  the other admin routes): reads `year` (default from schedule) + `rounds` from
  `race_calendar.json`, calls `rebuildCalibrationIndex`, returns `{ rows }`. For on-demand
  recovery.

## 6. Recovery of the current corrupted prod index (owner ops, after deploy)

1. Re-stamp the 8 backfilled snapshots so each carries `snap.reconstructed = true`. Run the
   admin backfill loop over the 8 (7 pre-beta + Great Britain; **Austria excluded** — its live
   snapshot must stay unflagged). This is now **safe in a loop**: each call writes only its own
   snapshot key (independent keys) and NO longer touches the index.

   ```bash
   BASE="https://sector4.net"
   for gp in Australia China Japan Miami Canada Monaco Barcelona "Great Britain"; do
     curl -sG "$BASE/api/admin/snapshot" \
       --data-urlencode "gp=$gp" --data-urlencode "checkpoint=final" \
       -H "Authorization: Bearer $CRON_SECRET"; echo
   done
   ```

2. Rebuild the index once:

   ```bash
   curl -s "$BASE/api/admin/rebuild-calibration" -H "Authorization: Bearer $CRON_SECRET"; echo
   ```

   Result: a clean, calendar-ordered 9-row index — Austria live (counted), the other 8 labeled
   "From testing · not predicted live" and excluded from the headline. (The daily cron also
   rebuilds every run, so even without step 2 the index self-corrects on the next cron fire —
   but the explicit call recovers it immediately.)

## 7. Tests

`app/lib/calibration-index.test.ts` (new, injected I/O):
- Builds rows from snapshots in `rounds` order (assert output order matches input order, not
  snapshot-read order).
- Carries `reconstructed` from the snapshot onto the row; omits the key when the snapshot lacks
  it.
- Skips rounds with no snapshot / no actuals / empty actuals.
- Writes the index exactly ONCE (assert `putJson` called once with the full array).

`app/lib/snapshot-write.test.ts` (update):
- `writeWeekendSnapshot` no longer writes the calibration index (the `seasonIndexKey` is never
  put). Move the reconstructed-stamp assertion to the SNAPSHOT object: `{ reconstructed: true }`
  stamps `snap.reconstructed`; default omits it. The prior index-row tests are replaced by
  snapshot-object assertions.

Cron route: reuse existing patterns; the rebuild summary appears in the response (no new
route-handler test — the pure functions carry coverage, consistent with the reconciler slice).

Regression: existing snapshot-write / reconcile / calibration / accuracy tests stay green
(calibration.ts `summarize` is unchanged; only the index WRITE path moves).

## 8. Files touched

- `app/lib/snapshot.ts` — `WeekendSnapshot.reconstructed?`.
- `app/lib/snapshot-write.ts` — remove index block; stamp `snap.reconstructed`; keep `snap.actuals`.
- `app/lib/calibration-index.ts` (new) — `rebuildCalibrationIndex`.
- `app/api/cron/snapshot/route.ts` — call rebuild after reconcile (failure-isolated), in response.
- `app/api/admin/rebuild-calibration/route.ts` (new) — on-demand rebuild.
- Tests: `calibration-index.test.ts` (new), `snapshot-write.test.ts` (updated).

No change to: prediction/Python, `calibration.ts` `summarize`, `/accuracy` render logic
(ordering now comes from the rebuild), `vercel.json`, R17, bundled data.

## 9. Follow-ups (logged, not this slice)

- `/accuracy` chart enhancement — "graph is just a line, needs more info" (add per-round markers
  / the Brier co-metric legend / axis labels / hover, whatever raises information density).
  Separate UX slice.
