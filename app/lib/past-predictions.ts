// Shapes the previous GP's frozen final podium call into predicted-vs-actual rows for the
// /weekend "setting up" modal. Pure + Blob-free so it is unit-testable; the page does the
// fetch. Reuses raceDetail (calibration.ts) for the top-3 predicted-vs-actual summary.
import { raceDetail } from "./calibration";

interface PodiumLike {
  drivers?: {
    rank?: number;
    driver: string;
    team?: string | null;
    band?: string;
    p_podium?: number;
  }[];
}

export interface PastRow {
  rank: number;
  driver: string;
  team: string | null;
  band: string;
  p_podium: number | null;
  finishPos: number | null; // 1-indexed actual finish, or null if not classified (DNF)
  isPodium: boolean;
}

export interface PastPredictionsData {
  rows: PastRow[];
  hasActuals: boolean;
  summary: { hits: number; of: number } | null;
}

/** The race whose predictions to show. Concluded (screen shows nextGp) -> the just-passed
 *  scheduleGp. Otherwise the calendar entry immediately before scheduleGp. No predecessor
 *  (round 1, or scheduleGp absent) -> null. */
export function resolvePrevGp(
  scheduleGp: string,
  calendar: string[],
  concluded: boolean,
): string | null {
  if (concluded) return scheduleGp;
  const idx = calendar.indexOf(scheduleGp);
  return idx > 0 ? calendar[idx - 1] : null;
}

export function pastPredictionRows(
  podium: PodiumLike | null | undefined,
  actuals: string[] | null | undefined,
): PastPredictionsData | null {
  const drivers = podium?.drivers;
  if (!drivers?.length) return null;

  const order = actuals && actuals.length ? actuals : null;
  const rows: PastRow[] = drivers.slice(0, 10).map((d, i) => {
    const foundAt = order ? order.indexOf(d.driver) : -1;
    const finishPos = foundAt >= 0 ? foundAt + 1 : null;
    return {
      rank: d.rank ?? i + 1,
      driver: d.driver,
      team: d.team ?? null,
      band: d.band ?? "outside shot",
      p_podium: typeof d.p_podium === "number" ? d.p_podium : null,
      finishPos,
      isPodium: finishPos != null && finishPos <= 3,
    };
  });

  const detail = order
    ? raceDetail(
        {
          drivers: drivers.filter(
            (x): x is { driver: string; p_podium: number } =>
              typeof x.p_podium === "number",
          ),
        },
        order,
      )
    : null;
  const summary = detail
    ? { hits: detail.hits.filter(Boolean).length, of: 3 }
    : null;

  return { rows, hasActuals: order != null, summary };
}
