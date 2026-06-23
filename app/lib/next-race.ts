// Resolves relative circuit references ("the next race", "this weekend") to a concrete
// upcoming Grand Prix. The race-weekend ops cadence keeps app/data/weekend-schedule.json
// pointed at the current weekend, so that file is the single source of "what's next":
// until its race finishes, IT is the next race; once finished, the following `nextGp` is.
import scheduleJson from "../data/weekend-schedule.json";

export interface UpcomingRace {
  year: number;
  gp: string; // canonical circuit key (matches the podium/pace/strategy table keys)
}

interface UpcomingSchedule {
  year: number;
  gp: string;
  final: string; // ISO timestamp of the race
  nextGp?: string; // canonical key of the weekend after this one, if known
}

const schedule = scheduleJson as UpcomingSchedule;

// Phrases a casual fan (or the parser) uses to mean "the upcoming weekend" instead of
// naming a circuit. Matched loosely so "the next grand prix", "next race", etc. all hit.
const RELATIVE_HINTS = ["next", "upcoming", "this weekend", "this week", "coming up"];

/** True when a (free-text) circuit value is a relative reference, not a named circuit. */
export function isRelativeCircuit(raw: string | undefined): boolean {
  if (!raw) return false;
  const c = raw.toLowerCase().replace(/[^a-z\s]/g, " ").replace(/\s+/g, " ").trim();
  if (!c) return false;
  return RELATIVE_HINTS.some((h) => c === h || c.includes(h));
}

/** The next upcoming race, resolved from the weekend schedule relative to `now`. */
export function nextRace(now: Date = new Date(), s: UpcomingSchedule = schedule): UpcomingRace {
  const finished = now.getTime() >= new Date(s.final).getTime();
  const gp = finished && s.nextGp ? s.nextGp : s.gp;
  return { year: s.year, gp };
}
