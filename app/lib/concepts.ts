// Concept whats — the hand-authored educational core of the learning layer (M6-A).
// Single static-imported JSON (bundler-safe, like drivers.json); accessors are pure so
// pages stay trivial. Badge enum already carries "community-reviewed" for C (no re-schema).
import data from "@/app/data/concepts.json";

export type Badge = "verified" | "drafted" | "community-reviewed";

export interface Concept {
  slug: string;
  term: string;
  group: string;
  summary: string;
  aliases: string[];
  body: string[];
  whyItMatters: string;
  related: string[];
  badge: Badge;
  sources: { label: string; url: string }[];
}

const CONCEPTS = data as Concept[];
const BY_SLUG = new Map(CONCEPTS.map((c) => [c.slug, c]));

export function allConcepts(): Concept[] {
  return CONCEPTS;
}

export function getConcept(slug: string): Concept | undefined {
  return BY_SLUG.get(slug);
}

// Lowercased aliases, longest-first so the most specific phrase wins ("safety car" over "car").
const ALIAS_TO_SLUG: { alias: string; slug: string }[] = CONCEPTS.flatMap((c) =>
  c.aliases.map((a) => ({ alias: a.toLowerCase(), slug: c.slug })),
).sort((a, b) => b.alias.length - a.alias.length);

const isWordChar = (ch: string | undefined) => !!ch && /[a-z0-9]/i.test(ch);

// Find the concept a free-text question is about by matching a concept alias as a whole word
// (e.g. "what is DRS?" -> the DRS concept). Longest alias wins; null if none appears.
export function matchConcept(text: string): string | null {
  const lower = text.toLowerCase();
  for (const { alias, slug } of ALIAS_TO_SLUG) {
    let from = 0;
    for (let i = lower.indexOf(alias, from); i >= 0; i = lower.indexOf(alias, from)) {
      if (!isWordChar(lower[i - 1]) && !isWordChar(lower[i + alias.length])) return slug;
      from = i + 1;
    }
  }
  return null;
}

export function conceptsByGroup(): { group: string; concepts: Concept[] }[] {
  const groups: { group: string; concepts: Concept[] }[] = [];
  for (const c of CONCEPTS) {
    let g = groups.find((x) => x.group === c.group);
    if (!g) groups.push((g = { group: c.group, concepts: [] }));
    g.concepts.push(c);
  }
  return groups;
}

export function resolveRelated(slug: string): Concept[] {
  const c = BY_SLUG.get(slug);
  if (!c) return [];
  return c.related.map((s) => BY_SLUG.get(s)).filter((x): x is Concept => x !== undefined);
}

const BADGE_LABELS: Record<Badge, string> = {
  verified: "Verified",
  drafted: "Drafted · unverified",
  "community-reviewed": "Community-reviewed",
};

export function badgeLabel(badge: Badge): string {
  return BADGE_LABELS[badge];
}
