import drivers from "@/app/data/drivers.json";
import teams from "@/app/data/teams.json";
import { contrastGuard } from "./contrast";

const NEUTRAL = "#9CA3AF"; // grey helmet for unknown/absent team

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
  const t = team ? (teams as Record<string, Team>)[team] : undefined;
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
