// Pure narrative linker (M6-B + M6-C). Turns a finished narrative string into segments
// where recognized concept terms and entity names (circuits, teams) become popover links.
// No React, no DOM — the real logic lives here so it is node-testable; components are
// thin wrappers.
import { allConcepts } from "@/app/lib/concepts";
import entityWhatsRaw from "@/app/data/entity-whats.json";

export type Segment = string | { text: string; slug: string };

interface AliasEntry {
  alias: string; // lowercased
  slug: string;
}

// Concept aliases (M6-B): every concept alias maps to its concept slug.
const conceptAliases: AliasEntry[] = allConcepts().flatMap((c) =>
  c.aliases.map((alias) => ({ alias: alias.toLowerCase(), slug: c.slug })),
);

// Entity aliases (M6-C): circuit + team titles/tracks/slugs map to their entity key
// ("circuit:<slug>" or "team:<slug>"). Drivers are NOT linkified inline — they surface
// via the glyph tap instead.
type RawWhat = { type: string; slug: string; title: string; track?: string };
const entityAliases: AliasEntry[] = Object.entries(entityWhatsRaw as Record<string, RawWhat>)
  .filter(([key]) => key.startsWith("circuit:") || key.startsWith("team:"))
  .flatMap(([key, w]) => {
    const seen = new Set<string>();
    const entries: AliasEntry[] = [];
    const add = (text: string) => {
      const lower = text.toLowerCase();
      if (lower && !seen.has(lower)) {
        seen.add(lower);
        entries.push({ alias: lower, slug: key });
      }
    };
    if (w.title) add(w.title);
    if (w.track) add(w.track);
    add(w.slug); // e.g. "Austria" or "McLaren"
    return entries;
  });

// All aliases, sorted longest-first so the most specific phrase wins at any position
// (e.g. "tyre deg" beats "deg"; "the Red Bull Ring" beats "Austria"). Built once at
// module load.
const ALIASES: AliasEntry[] = [...conceptAliases, ...entityAliases].sort(
  (a, b) => b.alias.length - a.alias.length,
);

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[A-Za-z0-9]/.test(ch);

export function linkifyNarrative(text: string): Segment[] {
  const segments: Segment[] = [];
  const consumed = new Set<string>(); // slugs already linked (first-occurrence-only)
  const lower = text.toLowerCase();
  let i = 0;
  let plainStart = 0;

  while (i < text.length) {
    let matched: AliasEntry | null = null;
    for (const entry of ALIASES) {
      if (consumed.has(entry.slug)) continue;
      if (!lower.startsWith(entry.alias, i)) continue;
      const before = text[i - 1];
      const after = text[i + entry.alias.length];
      if (!isWordChar(before) && !isWordChar(after)) {
        matched = entry; // ALIASES is longest-first, so the first hit is the longest
        break;
      }
    }
    if (matched) {
      if (plainStart < i) segments.push(text.slice(plainStart, i));
      const end = i + matched.alias.length;
      segments.push({ text: text.slice(i, end), slug: matched.slug });
      consumed.add(matched.slug);
      i = end;
      plainStart = end;
    } else {
      i += 1;
    }
  }
  if (plainStart < text.length) segments.push(text.slice(plainStart));
  return segments;
}

interface Rect { top: number; bottom: number; left: number; width: number; }
interface Size { width: number; height: number; }

// Pure placement math: below the anchor by default, flip above when there is no room below
// but room above, and clamp horizontally into the viewport with `margin` padding.
export function computePopoverPosition(
  anchor: Rect,
  size: Size,
  viewport: Size,
  margin = 8,
): { top: number; left: number; flipped: boolean } {
  const fitsBelow = anchor.bottom + margin + size.height <= viewport.height;
  const fitsAbove = anchor.top - margin - size.height >= 0;
  const flipped = !fitsBelow && fitsAbove;
  const top = flipped ? anchor.top - margin - size.height : anchor.bottom + margin;
  const centered = anchor.left + anchor.width / 2 - size.width / 2;
  const left = Math.max(margin, Math.min(centered, viewport.width - size.width - margin));
  return { top, left, flipped };
}
