// Frozen per-weekend prediction snapshot (the "issued" artifact + the logged
// prediction). Keys are deterministic so the cron can write idempotently and the
// /weekend page can read the latest without listing. (M5 R12)

export type Checkpoint = "pre-quali" | "post-quali" | "final";

export interface WeekendSnapshot {
  year: number;
  gp: string;
  checkpoint: Checkpoint;
  issuedAt: string; // ISO timestamp
  podium: unknown;
  pace: unknown;
  strategy: unknown;
  actuals?: unknown;
  calibrationNote: string;
}

const slug = (year: number, gp: string) => `${year}-${gp.replace(/\s+/g, "-")}`;

export const snapshotKey = (year: number, gp: string, c: Checkpoint) =>
  `weekends/${slug(year, gp)}/${c}.json`;
export const latestKey = (year: number, gp: string) =>
  `weekends/${slug(year, gp)}/latest.json`;
export const seasonIndexKey = (year: number) => `calibration/${year}-index.json`;
