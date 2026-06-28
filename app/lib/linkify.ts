// Pure narrative linker (M6-B). Turns a finished narrative string into segments where
// recognized concept terms become links into the learning layer. No React, no DOM — the
// real logic lives here so it is node-testable; the components are thin wrappers.
import { allConcepts } from "@/app/lib/concepts";

export type Segment = string | { text: string; slug: string };

interface AliasEntry {
  alias: string; // lowercased
  slug: string;
}

// All aliases, sorted longest-first so the most specific phrase wins at any position
// (e.g. "tyre deg" beats "deg"). Built once at module load.
const ALIASES: AliasEntry[] = allConcepts()
  .flatMap((c) => c.aliases.map((alias) => ({ alias: alias.toLowerCase(), slug: c.slug })))
  .sort((a, b) => b.alias.length - a.alias.length);

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
