import drivers from "@/app/data/drivers.json";
import teams from "@/app/data/teams.json";
import { contrastGuard } from "./contrast";

const NEUTRAL = "#9CA3AF"; // grey helmet for unknown/absent team

// The data pipeline (fastf1 season results) emits team-name variants and lineage names
// that differ from the teams.json color-map keys, which would fall to grey. Map each to
// its canonical key. New standalone 2026 teams (Audi, Cadillac F1 Team) are added to
// teams.json directly and need no alias.
const TEAM_ALIASES: Record<string, string> = {
  "Red Bull": "Red Bull Racing",
  "Alpine F1 Team": "Alpine",
  "RB F1 Team": "Racing Bulls",
  AlphaTauri: "Racing Bulls",
  "Alfa Romeo": "Kick Sauber",
};

export type ResolvedGlyph = {
  code: string;
  number: number | null;
  helmetFill: string;
  accent: string;
  numberColor: string;
  known: boolean;
};

type Driver = { name: string; number: number; personalColor: string };
type Team = { primary: string; secondary: string };

/** Full driver name for a 3-letter code, or the code itself if unknown. Pure. */
export function driverName(code: string): string {
  return (drivers as Record<string, Driver>)[code]?.name ?? code;
}

/** Resolve a 3-letter code + team name to render-ready glyph values. Pure. */
export function resolveGlyph(code: string, team: string | null): ResolvedGlyph {
  const d = (drivers as Record<string, Driver>)[code];
  const teamKey = team ? (TEAM_ALIASES[team] ?? team) : undefined;
  const t = teamKey ? (teams as Record<string, Team>)[teamKey] : undefined;
  const helmetFill = t?.primary ?? NEUTRAL;
  const accent = t?.secondary ?? NEUTRAL;
  const personal = d?.personalColor ?? "#FFFFFF";
  return {
    code,
    number: d?.number ?? null,
    helmetFill,
    accent,
    numberColor: contrastGuard(personal, helmetFill),
    known: Boolean(d),
  };
}
