// Canonical circuit keys for the podium feature table (the validated 8-circuit dry
// set). The Haiku parser emits free-text circuit names ("Monza", "Italian GP"); the
// podium table is keyed on these canonical names, so we normalize before querying.
// Scope is deliberately the 8 circuits we have data for — anything else returns null
// and the caller surfaces an honest "not in this slice" message (no fake number).

// The live beta season — used when the parser omits a year.
export const DEFAULT_YEAR = 2026;

export const CANONICAL_CIRCUITS = [
  // validated dry set (2023-25)
  "Bahrain",
  "Saudi Arabia",
  "Spain",
  "Hungary",
  "Italy",
  "Mexico City",
  "Las Vegas",
  "Abu Dhabi",
  // 2026 calendar circuits (through Austria + the next, Britain)
  "Australia",
  "China",
  "Japan",
  "Miami",
  "Canada",
  "Monaco",
  "Austria",
  "Great Britain",
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
  // 2026 calendar circuits. NOTE: "barcelona"/"catalunya" stay mapped to "Spain"
  // (the historical dry-set key); 2026 also has a distinct "Barcelona Grand Prix"
  // (round 7) used only as training history, never a query target, so the collision
  // is harmless for the beta. Revisit if full-calendar querying needs both keys.
  australia: "Australia",
  australian: "Australia",
  melbourne: "Australia",
  "albert park": "Australia",
  china: "China",
  chinese: "China",
  shanghai: "China",
  japan: "Japan",
  japanese: "Japan",
  suzuka: "Japan",
  miami: "Miami",
  canada: "Canada",
  canadian: "Canada",
  montreal: "Canada",
  monaco: "Monaco",
  "monte carlo": "Monaco",
  montecarlo: "Monaco",
  austria: "Austria",
  austrian: "Austria",
  "red bull ring": "Austria",
  spielberg: "Austria",
  britain: "Great Britain",
  british: "Great Britain",
  "great britain": "Great Britain",
  silverstone: "Great Britain",
  uk: "Great Britain",
};

const STOPWORDS = new Set(["grand", "grands", "prix", "circuit", "gp", "the"]);

function clean(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOPWORDS.has(w))
    .join(" ")
    .trim();
}

/** Free-text circuit name → canonical podium-table key, or null if not one of the 8. */
export function normalizeCircuit(raw: string | undefined): string | null {
  if (!raw) return null;
  return ALIASES[clean(raw)] ?? null;
}

// Pit-loss is curated for the 8 podium circuits PLUS Monaco; deg/stint only have data
// for the 8 strategy-table circuits.
const LOOKUP_ALIASES: Record<string, string> = {
  ...ALIASES,
  monaco: "Monaco",
  "monte carlo": "Monaco",
};

/** Free-text circuit → canonical key for a lookup_stat, scoped by stat, or null. */
export function normalizeLookupCircuit(
  raw: string | undefined,
  stat: string,
): string | null {
  if (!raw) return null;
  const c = LOOKUP_ALIASES[clean(raw)] ?? null;
  if (!c) return null;
  if (stat === "pit_loss") return c; // 8 + Monaco
  return c === "Monaco" ? null : c; // deg / stint: strategy-table 8 only
}
