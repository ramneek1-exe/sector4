/**
 * Owner-authored race-engineer radio lines for the landing intro helmet
 * (app/components/RadioHelmet.tsx). Verbatim; do not edit copy.
 *
 * "We are checking…" also appears in LOADING_LINES (app/lib/loading-lines.ts) for the /ask
 * spinner. That overlap is deliberate and the two lists stay independent — they serve
 * different surfaces and the loading list is written in a different voice.
 */
export const RADIO_MESSAGES: readonly string[] = [
  "Box, box.",
  "Box for mediums next lap…",
  "Sector 4 pace is good…",
  "Must be the water…",
  "You are now the race leader.",
  "You're the fastest man on track.",
  "If you speak to me every lap, I will disconnect the radio.",
  "Final lap. Push! Push! Push!",
  "We're on Plan B.",
  "That is P3 currently, purple Sector 4.",
  "We are checking…",
];

/**
 * A random line, never the one just shown. Falls back to the full list when `prev` filters
 * everything out (a one-entry list, or a `prev` that isn't in the list at all), so this
 * always returns a real message rather than looping or throwing.
 */
export function pickRadioMessage(prev: string | null): string {
  const pool = RADIO_MESSAGES.filter((m) => m !== prev);
  const from = pool.length > 0 ? pool : RADIO_MESSAGES;
  return from[Math.floor(Math.random() * from.length)];
}

/** One reveal step: the message truncated to that word, and when it appears. */
export type RadioStep = { text: string; atMs: number };

const WORD_MS = 130; // base beat between words
const PAUSE_MS = 120; // extra hold after a word that ends a clause
const ENDS_CLAUSE = /[,.!?…]$/;

/**
 * Per-word reveal timings for one radio line, mimicking the broadcast caption: words land
 * one at a time and the rhythm breaks at punctuation the way a spoken call does.
 *
 * `text` on each step is the message built up to that word, so a consumer renders
 * `steps[i].text` directly instead of reassembling. Whitespace is normalised (trimmed,
 * internal runs collapsed), which is a no-op for every entry in RADIO_MESSAGES.
 */
export function radioSteps(text: string): RadioStep[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const steps: RadioStep[] = [];
  let at = 0;
  for (let i = 0; i < words.length; i++) {
    steps.push({ text: words.slice(0, i + 1).join(" "), atMs: at });
    at += WORD_MS + (ENDS_CLAUSE.test(words[i]) ? PAUSE_MS : 0);
  }
  return steps;
}
