// Post-process a Haiku paraphrase: enforce the house rules (no em-dashes) and a tight length.
export function sanitizeParaphrase(text: string, maxSentences = 3): string {
  const noDash = text.replace(/\s*—\s*/g, ", ").replace(/\s+/g, " ").trim();
  const parts = noDash.match(/[^.!?]+[.!?]+/g) ?? [noDash];
  return parts.slice(0, maxSentences).map((s) => s.trim()).join(" ").trim();
}
