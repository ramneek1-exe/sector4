// The championship picture: where the season stands, how far back each competitor is, and
// what closing that gap demands. Pure arithmetic over points already in the pipeline — no
// model, no probability, nothing to calibrate. See
// docs/superpowers/specs/2026-07-25-championship-picture-design.md.
//
// `requiredRate` is an OUT-SCORING rate, not a scoring rate: the leader keeps scoring too,
// so "needs 3.3 a round" would be false where "must out-score the leader by 3.3 a round"
// is true. Every label built from this value must use the second form.

export type Standing = {
  key: string; // driver code ("VER") or team name ("McLaren")
  points: number;
  rank: number; // 1-based; equal points share a rank
  gap: number; // points behind the leader; 0 for the leader (and for anyone tied with them)
  requiredRate: number | null; // null for the leader and when no rounds remain
};

export type StandingsFile = {
  year: number;
  throughGp: string;
  throughRound: number;
  totalRounds: number;
  remainingRounds: number;
  drivers: Record<string, number>;
  teams: Record<string, number>;
};

/** Points table -> ranked standings. `remainingRounds` <= 0 means no rate is defined. */
export function buildStandings(
  points: Record<string, number>,
  remainingRounds: number,
): Standing[] {
  const entries = Object.entries(points).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return [];
  const leaderPoints = entries[0][1];
  const rounds = Math.max(0, Math.floor(remainingRounds));
  return entries.map(([key, pts]) => {
    // Equal points share the rank of the first competitor on that score — real F1 breaks
    // these on countback (most wins, then most seconds) and we deliberately do not, so a
    // tie renders as a genuine tie rather than an invented order.
    const rank = entries.findIndex(([, p]) => p === pts) + 1;
    const gap = Math.round((leaderPoints - pts) * 10) / 10;
    const requiredRate =
      gap > 0 && rounds > 0 ? Math.round((gap / rounds) * 10) / 10 : null;
    return { key, points: pts, rank, gap, requiredRate };
  });
}

/** True when the payload has every field the table needs, with the right types. */
export function isStandingsFile(x: unknown): x is StandingsFile {
  if (!x || typeof x !== "object") return false;
  const s = x as Partial<StandingsFile>;
  const nums = [s.year, s.throughRound, s.totalRounds, s.remainingRounds];
  if (!nums.every((n) => typeof n === "number" && Number.isFinite(n))) return false;
  if (typeof s.throughGp !== "string" || !s.throughGp) return false;
  const isPointMap = (m: unknown) =>
    !!m &&
    typeof m === "object" &&
    Object.values(m as Record<string, unknown>).every(
      (v) => typeof v === "number" && Number.isFinite(v),
    );
  return isPointMap(s.drivers) && isPointMap(s.teams);
}

/**
 * The committed standings, or null when the file is absent or malformed. Absent is the
 * NORMAL state until the weekend refresh first writes it, so every caller must handle null
 * — the section simply does not render, and the intent says standings are unavailable. We
 * never construct or stale-guess a table, matching api/podium.py's unknown-circuit rule.
 */
export function loadStandings(): StandingsFile | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const data: unknown = require("@/app/data/standings.json");
    return isStandingsFile(data) ? data : null;
  } catch {
    return null;
  }
}

export function driverStandings(file: StandingsFile): Standing[] {
  return buildStandings(file.drivers, file.remainingRounds);
}

export function teamStandings(file: StandingsFile): Standing[] {
  return buildStandings(file.teams, file.remainingRounds);
}
