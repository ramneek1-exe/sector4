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
  // Driver -> current team name (teams.json key), for the helmet glyph's team colour
  // (PRD §8). Optional: no standings.json exists yet, and an older emitter that hasn't
  // picked up this field must still validate — absence degrades to today's neutral-grey
  // helmet, never to the whole section vanishing.
  driverTeams?: Record<string, string>;
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
    !Array.isArray(m) &&
    Object.values(m as Record<string, unknown>).every(
      (v) => typeof v === "number" && Number.isFinite(v),
    );
  if (!isPointMap(s.drivers) || !isPointMap(s.teams)) return false;
  // driverTeams is optional; when present it must be a non-array object of string values.
  if (s.driverTeams !== undefined) {
    const dt = s.driverTeams;
    if (!dt || typeof dt !== "object" || Array.isArray(dt)) return false;
    if (!Object.values(dt).every((v) => typeof v === "string")) return false;
  }
  return true;
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

// Minimal shape championshipLede needs — structurally satisfied by narrative.ts's
// ChampionshipFacts (which adds `kind` + `throughGp`), so both the narrative generator's
// system prompt and the /ask UI can share this one implementation with no drift.
type ChampionshipLedeInput = {
  year: number;
  remainingRounds: number;
  totalRounds: number;
  rows: Standing[];
};

/**
 * Deterministic one-liner; the LLM narrative expands on it but may not contradict it.
 * Lives here rather than in narrative.ts because this module has no dependency on the
 * Anthropic SDK and is already safe to import from client components (ChampionshipTable.tsx
 * does so today) -- narrative.ts pulls in the Anthropic client at module scope, which is
 * server-only and cannot be bundled for the browser. narrative.ts re-exports this function
 * so callers there see the same shape the task brief describes.
 */
export function championshipLede(f: ChampionshipLedeInput): string {
  const [leader, second] = f.rows;
  if (!leader) return "Championship standings are not available yet.";
  if (!second) return `${leader.key} leads the ${f.year} championship on ${leader.points} points.`;
  return (
    `${leader.key} leads the ${f.year} championship on ${leader.points} points, ` +
    `${second.gap} clear of ${second.key} with ${f.remainingRounds} of ${f.totalRounds} rounds left.`
  );
}
