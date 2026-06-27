// Qualifying grids ({driver: grid_position}) keyed "<year>-<gp>" (race_id), written by
// R17's build_2026 grid step after quali (fastf1 source of truth) and read here to sharpen
// the upcoming-weekend podium Friday -> Saturday. A single static-imported JSON (bundler-
// safe, like drivers.json) — a dynamically-named per-file import risks Next not tracing the
// file into the serverless bundle. An absent/empty key -> undefined -> honest Friday mode.
import grids from "@/app/data/grids.json";

export type Grid = Record<string, number>;
const GRIDS = grids as Record<string, Grid>;

export function gridKey(year: number, gp: string): string {
  return `${year}-${gp}`;
}

export function getGrid(year: number, gp: string): Grid | undefined {
  const g = GRIDS[gridKey(year, gp)];
  return g && Object.keys(g).length > 0 ? g : undefined;
}
