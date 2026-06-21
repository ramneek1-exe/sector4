// Resolves which prediction checkpoint is due "now" from a weekend's real session
// times. A fixed cron can't track each circuit's timezone/schedule, so the cron runs
// often and this decides the due checkpoint; idempotency (don't re-snapshot) lives in
// the cron route. (M5 R14)
import type { Checkpoint } from "./snapshot";

export interface SessionSchedule {
  year: number;
  gp: string;
  preQuali: string; // after final practice, before qualifying
  postQuali: string; // after qualifying (grid known)
  final: string; // after the race
}

export function dueCheckpoint(now: Date, s: SessionSchedule): Checkpoint | null {
  const t = now.getTime();
  if (t >= new Date(s.final).getTime()) return "final";
  if (t >= new Date(s.postQuali).getTime()) return "post-quali";
  if (t >= new Date(s.preQuali).getTime()) return "pre-quali";
  return null;
}
