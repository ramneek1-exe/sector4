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
  // remaining 2026 rounds — historical stop/pit-loss norms available now; actuals fill in
  // as each runs. (Barcelona & Spain/Madrid stay folded into "Spain" below, see note.)
  "Belgium",
  "Netherlands",
  "Azerbaijan",
  "Singapore",
  "United States",
  "São Paulo",
  "Qatar",
] as const;

// gp key → the Grand Prix's short label for UI copy, so "Check out <label> GP" reads
// naturally ("British GP", "Belgian GP"). Many circuits already read fine as "<key> GP"
// (Monaco, Miami, Qatar, Azerbaijan) and fall back to the key; only the ones whose GP name
// is adjectival/distinct are mapped.
const GP_LABEL: Record<string, string> = {
  "Saudi Arabia": "Saudi Arabian",
  Spain: "Spanish",
  Hungary: "Hungarian",
  Italy: "Italian",
  Australia: "Australian",
  China: "Chinese",
  Japan: "Japanese",
  Canada: "Canadian",
  Austria: "Austrian",
  "Great Britain": "British",
  Belgium: "Belgian",
  Netherlands: "Dutch",
};

// The Grand Prix's short label ("British", "Belgian", ...) for a canonical gp key.
// Falls back to the key itself for place-named GPs (Monaco, Miami, ...).
export function gpLabel(gp: string): string {
  return GP_LABEL[gp] ?? gp;
}

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
  "united kingdom": "Great Britain",
  england: "Great Britain",
  silverstone: "Great Britain",
  uk: "Great Britain",
  // remaining 2026 rounds (added so upcoming-race stop/pit-loss queries resolve)
  belgium: "Belgium",
  belgian: "Belgium",
  spa: "Belgium",
  "spa francorchamps": "Belgium",
  netherlands: "Netherlands",
  dutch: "Netherlands",
  zandvoort: "Netherlands",
  azerbaijan: "Azerbaijan",
  baku: "Azerbaijan",
  singapore: "Singapore",
  "marina bay": "Singapore",
  "united states": "United States",
  usa: "United States",
  "us grand prix": "United States",
  cota: "United States",
  austin: "United States",
  "sao paulo": "São Paulo",
  "são paulo": "São Paulo",
  brazil: "São Paulo",
  brazilian: "São Paulo",
  interlagos: "São Paulo",
  qatar: "Qatar",
  lusail: "Qatar",
  losail: "Qatar",
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
// for the 8 strategy-table circuits. 2026 has a distinct "Barcelona" circuit
// (separate from the historical "Spain" entries in 2023-25).
const LOOKUP_ALIASES: Record<string, string> = {
  ...ALIASES,
  barcelona: "Barcelona", // Override: 2026 Barcelona is a distinct circuit in pit-loss table
  catalunya: "Barcelona",
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
