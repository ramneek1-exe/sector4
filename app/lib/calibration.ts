// Season calibration record -> display model for the /accuracy page (M7).
// Pure + fully rounded here (house rule: round every number that reaches output). Reads
// NOTHING; the cron (app/api/cron/snapshot/route.ts) accumulates the raw Blob index and
// callers pass it in. Display-only: we never fit or flip to % in v1.

export interface CalibrationRow {
  gp: string;
  issuedAt: string;
  brierContrib: number;
  top3: number;
}

export interface CumulativePoint {
  round: number;
  gp: string;
  top3Rate: number;
  meanBrier: number;
}

export interface CalibrationStatus {
  ready: boolean;
  nRaces: number;
  reason: string;
}

export interface CalibrationSummary {
  nRaces: number;
  top3Rate: number;
  meanBrier: number;
  cumulative: CumulativePoint[];
  status: CalibrationStatus;
}

export interface RaceDetail {
  predicted: string[];
  actual: string[];
  hits: boolean[];
}

// Scored races required before measured %-calibration can even be attempted. v1 never
// flips (display-only); the future %-slice will flip status.ready on
// `nRaces >= CALIBRATION_MIN_RACES && reliabilityPasses(index)`.
export const CALIBRATION_MIN_RACES = 6;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function calibrationStatus(index: CalibrationRow[]): CalibrationStatus {
  const nRaces = index.length;
  return {
    ready: false, // v1 is display-only; see CALIBRATION_MIN_RACES.
    nRaces,
    reason:
      "We report qualitative bands, not percentages, until calibration is measured over " +
      `enough races. ${nRaces} logged so far.`,
  };
}

export function summarize(index: CalibrationRow[]): CalibrationSummary {
  const nRaces = index.length;
  const status = calibrationStatus(index);
  if (nRaces === 0) {
    return { nRaces: 0, top3Rate: 0, meanBrier: 0, cumulative: [], status };
  }
  let sumTop3 = 0;
  let sumBrier = 0;
  const cumulative: CumulativePoint[] = index.map((r, i) => {
    sumTop3 += r.top3;
    sumBrier += r.brierContrib;
    return {
      round: i + 1,
      gp: r.gp,
      top3Rate: round2(sumTop3 / (i + 1)),
      meanBrier: round3(sumBrier / (i + 1)),
    };
  });
  return {
    nRaces,
    top3Rate: round2(sumTop3 / nRaces),
    meanBrier: round3(sumBrier / nRaces),
    cumulative,
    status,
  };
}

// Pure extraction of the per-race predicted-vs-actual detail from a frozen final snapshot's
// podium + actuals. Blob-free so it is unit-testable; the page does the fetch.
export function raceDetail(
  podium: { drivers: { driver: string; p_podium: number }[] } | null | undefined,
  actuals: string[] | null | undefined,
): RaceDetail | null {
  if (!podium?.drivers?.length || !actuals?.length) return null;
  const predicted = [...podium.drivers]
    .sort((a, b) => b.p_podium - a.p_podium)
    .slice(0, 3)
    .map((d) => d.driver);
  const actual = actuals.slice(0, 3);
  const actualTop3 = new Set(actual);
  const hits = predicted.map((d) => actualTop3.has(d));
  return { predicted, actual, hits };
}
