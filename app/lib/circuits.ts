// Canonical circuit keys for the podium feature table (the validated 8-circuit dry
// set). The Haiku parser emits free-text circuit names ("Monza", "Italian GP"); the
// podium table is keyed on these canonical names, so we normalize before querying.
// Scope is deliberately the 8 circuits we have data for — anything else returns null
// and the caller surfaces an honest "not in this slice" message (no fake number).

export const CANONICAL_CIRCUITS = [
  "Bahrain",
  "Saudi Arabia",
  "Spain",
  "Hungary",
  "Italy",
  "Mexico City",
  "Las Vegas",
  "Abu Dhabi",
] as const;

// Common aliases (lowercased) → canonical key. Includes the country/circuit/city
// names a casual fan or the parser is likely to produce.
const ALIASES: Record<string, string> = {
  bahrain: "Bahrain",
  sakhir: "Bahrain",
  "saudi arabia": "Saudi Arabia",
  saudi: "Saudi Arabia",
  "saudi arabian": "Saudi Arabia",
  jeddah: "Saudi Arabia",
  spain: "Spain",
  spanish: "Spain",
  barcelona: "Spain",
  catalunya: "Spain",
  hungary: "Hungary",
  hungarian: "Hungary",
  budapest: "Hungary",
  hungaroring: "Hungary",
  italy: "Italy",
  italian: "Italy",
  monza: "Italy",
  "mexico city": "Mexico City",
  mexico: "Mexico City",
  mexican: "Mexico City",
  "las vegas": "Las Vegas",
  vegas: "Las Vegas",
  "abu dhabi": "Abu Dhabi",
  "yas marina": "Abu Dhabi",
};

const STOPWORDS = new Set(["grand", "grands", "prix", "circuit", "gp", "the"]);

/** Free-text circuit name → canonical podium-table key, or null if not one of the 8. */
export function normalizeCircuit(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
  return ALIASES[cleaned] ?? null;
}
