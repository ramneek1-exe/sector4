# M6-B — Inline Concept Links + In-Context Popover — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the concepts a prediction narrative references clickable inline, opening an in-context popover (anchored over the clicked word) that shows the concept summary, trust badge, and a link to the full `/learn/[slug]` page.

**Architecture:** A pure `linkifyNarrative` function turns a finished narrative string into segments (plain text + concept links) via deterministic alias matching against `concepts.json`. A `NarrativeText` component renders those segments, replacing the four raw `<p>{narrative}</p>` blocks. A `ConceptPopoverProvider` (Context) wrapping the answer area owns one popover instance and exposes an `open()` hook, so the four cards never thread props. Popover placement math is a second pure function so it is node-testable.

**Tech Stack:** Next.js App Router (client component `app/page.tsx`), TypeScript, React portals, Tailwind, vitest (node env). No Python changes. No new dependencies.

## Global Constraints

- **No new test infra.** vitest runs in **node env**, `include: ["app/**/*.test.ts"]`. No jsdom/testing-library. All logic tests are pure `.test.ts`; components are verified by `tsc` + `npm run build` + live preview.
- **Round every number that reaches output.** (No new numbers are surfaced here, but honor it if any appear.)
- **Gate all motion behind `prefers-reduced-motion`** (use Tailwind `motion-reduce:transition-none`).
- **Reuse existing patterns:** portal + show/close transition from `DriverStopsModal` (`app/page.tsx:112`); growing-underline link via the `.cta-grow` class (`app/globals.css:66`); `TrustBadge` from `app/components/TrustBadge.tsx`; `getConcept`/`allConcepts` from `app/lib/concepts.ts`.
- **Scope:** linking applies to the **4 answer narratives only** (Stat, Podium, Pace, Strategy). No `/learn` body, no circuit facts.
- **Commit style:** conventional, focused, **no AI attribution** (no "Generated with…", no Co-Authored-By, no robot emoji).
- **Branch:** all work on `m6b-concept-links` (already checked out).

---

### Task 1: Add `aliases` to the concept model

**Files:**
- Modify: `app/lib/concepts.ts` (the `Concept` interface)
- Modify: `app/data/concepts.json` (all 8 entries)
- Test: `app/lib/concepts.test.ts` (create if absent; otherwise append)

**Interfaces:**
- Consumes: nothing.
- Produces: `Concept.aliases: string[]` on every concept; `allConcepts()` entries each carry a non-empty `aliases` array. Task 2 reads these.

- [ ] **Step 1: Write the failing test**

Create or append to `app/lib/concepts.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { allConcepts } from "@/app/lib/concepts";

describe("concept aliases", () => {
  it("every concept has at least one non-empty alias", () => {
    for (const c of allConcepts()) {
      expect(Array.isArray(c.aliases), `${c.slug} aliases`).toBe(true);
      expect(c.aliases.length, `${c.slug} alias count`).toBeGreaterThan(0);
      for (const a of c.aliases) expect(a.trim().length, `${c.slug} alias "${a}"`).toBeGreaterThan(0);
    }
  });

  it("aliases are globally unique (no alias maps to two concepts)", () => {
    const seen = new Map<string, string>();
    for (const c of allConcepts()) {
      for (const a of c.aliases) {
        const key = a.toLowerCase();
        expect(seen.has(key), `duplicate alias "${a}" (${seen.get(key)} vs ${c.slug})`).toBe(false);
        seen.set(key, c.slug);
      }
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/concepts.test.ts`
Expected: FAIL — `aliases` is `undefined` (property missing on the JSON entries / type), so `c.aliases.length` throws or the array check fails.

- [ ] **Step 3: Add the field to the type**

In `app/lib/concepts.ts`, add `aliases` to the `Concept` interface (place it right after `summary`):

```ts
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
```

- [ ] **Step 4: Add aliases to all 8 JSON entries**

In `app/data/concepts.json`, add an `aliases` array to each concept (place it right after that concept's `"summary"` line). Use exactly these values:

- `tyre-degradation`: `["tyre degradation", "tyre deg", "degradation", "deg"]`
- `undercut-overcut`: `["undercut", "overcut"]`
- `stop-count-strategy`: `["stop-count", "stop count", "one-stop", "two-stop", "extra stop"]`
- `pit-lane-time-loss`: `["pit-lane time loss", "pit lane loss", "pit loss", "pit stop"]`
- `qualifying-vs-race-pace`: `["qualifying pace", "race pace", "quali pace"]`
- `track-evolution`: `["track evolution", "track ramps up", "rubbering in"]`
- `dirty-air`: `["dirty air", "clean air"]`
- `drs`: `["drs", "active aero", "active-aero", "overtake boost"]`

Example for the first entry:

```json
    "summary": "How a tyre loses grip and pace as a stint goes on, the core driver of race strategy.",
    "aliases": ["tyre degradation", "tyre deg", "degradation", "deg"],
    "body": [
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run app/lib/concepts.test.ts`
Expected: PASS (both tests).

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add app/lib/concepts.ts app/data/concepts.json app/lib/concepts.test.ts
git commit -m "feat: add aliases field to concept model for narrative linking"
```

---

### Task 2: `linkify.ts` — pure narrative linker + popover positioning

**Files:**
- Create: `app/lib/linkify.ts`
- Test: `app/lib/linkify.test.ts`

**Interfaces:**
- Consumes: `allConcepts()` (Task 1's `aliases`).
- Produces:
  - `type Segment = string | { text: string; slug: string }`
  - `linkifyNarrative(text: string): Segment[]`
  - `computePopoverPosition(anchor: Rect, size: Size, viewport: Size, margin?: number): { top: number; left: number; flipped: boolean }` where `Rect = { top: number; bottom: number; left: number; width: number }` and `Size = { width: number; height: number }`.
  Tasks 3 and 4 consume all three.

- [ ] **Step 1: Write the failing tests**

Create `app/lib/linkify.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { linkifyNarrative, computePopoverPosition, type Segment } from "@/app/lib/linkify";

const links = (segs: Segment[]) => segs.filter((s): s is { text: string; slug: string } => typeof s !== "string");

describe("linkifyNarrative", () => {
  it("returns a single plain segment when nothing matches", () => {
    const segs = linkifyNarrative("The weather was sunny in the paddock.");
    expect(segs).toEqual(["The weather was sunny in the paddock."]);
  });

  it("links a known term and preserves surrounding text", () => {
    const segs = linkifyNarrative("Expect high tyre degradation here.");
    expect(segs[0]).toBe("Expect high ");
    expect(segs[1]).toEqual({ text: "tyre degradation", slug: "tyre-degradation" });
    expect(segs[2]).toBe(" here.");
  });

  it("prefers the longest matching alias at a position", () => {
    // "tyre deg" must win over the shorter "deg"
    const segs = linkifyNarrative("Watch the tyre deg closely.");
    expect(links(segs)[0]).toEqual({ text: "tyre deg", slug: "tyre-degradation" });
  });

  it("respects word boundaries (no match inside a longer word)", () => {
    const segs = linkifyNarrative("It was 12 degrees and degenerate.");
    expect(links(segs)).toHaveLength(0);
  });

  it("is case-insensitive but preserves the original casing in the segment", () => {
    const segs = linkifyNarrative("DEG is the story today.");
    expect(links(segs)[0]).toEqual({ text: "DEG", slug: "tyre-degradation" });
  });

  it("links only the first occurrence of a concept", () => {
    const segs = linkifyNarrative("Deg, more deg, even more deg.");
    expect(links(segs)).toHaveLength(1);
    expect(links(segs)[0].slug).toBe("tyre-degradation");
  });

  it("links multiple distinct concepts in one sentence", () => {
    const segs = linkifyNarrative("High degradation forces an extra stop and a pit stop.");
    const slugs = links(segs).map((l) => l.slug);
    expect(slugs).toContain("tyre-degradation");
    expect(slugs).toContain("stop-count-strategy"); // "extra stop"
    expect(slugs).toContain("pit-lane-time-loss");  // "pit stop"
  });
});

describe("computePopoverPosition", () => {
  const vp = { width: 1000, height: 800 };
  const size = { width: 288, height: 180 };

  it("places below the anchor by default and centers horizontally", () => {
    const anchor = { top: 100, bottom: 116, left: 400, width: 40 };
    const { top, left, flipped } = computePopoverPosition(anchor, size, vp);
    expect(flipped).toBe(false);
    expect(top).toBe(116 + 8);
    expect(left).toBe(400 + 20 - 144); // anchor center 420 minus half width 144
  });

  it("flips above when there is no room below but room above", () => {
    const anchor = { top: 700, bottom: 716, left: 400, width: 40 };
    const { top, flipped } = computePopoverPosition(anchor, size, vp);
    expect(flipped).toBe(true);
    expect(top).toBe(700 - 8 - 180);
  });

  it("stays below when neither side fits", () => {
    const tall = { width: 288, height: 790 };
    const anchor = { top: 5, bottom: 21, left: 400, width: 40 };
    const { flipped } = computePopoverPosition(anchor, tall, vp);
    expect(flipped).toBe(false);
  });

  it("clamps to the left edge", () => {
    const anchor = { top: 100, bottom: 116, left: 0, width: 20 };
    const { left } = computePopoverPosition(anchor, size, vp);
    expect(left).toBe(8);
  });

  it("clamps to the right edge", () => {
    const anchor = { top: 100, bottom: 116, left: 990, width: 10 };
    const { left } = computePopoverPosition(anchor, size, vp);
    expect(left).toBe(1000 - 288 - 8);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run app/lib/linkify.test.ts`
Expected: FAIL — `Cannot find module '@/app/lib/linkify'`.

- [ ] **Step 3: Implement `app/lib/linkify.ts`**

```ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run app/lib/linkify.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/lib/linkify.ts app/lib/linkify.test.ts
git commit -m "feat: pure narrative linker + popover positioning (linkify.ts)"
```

---

### Task 3: `ConceptPopover` provider + `NarrativeText` component

**Files:**
- Create: `app/components/ConceptPopover.tsx`
- Create: `app/components/NarrativeText.tsx`

**Interfaces:**
- Consumes: `linkifyNarrative`, `computePopoverPosition` (Task 2); `getConcept` (`app/lib/concepts.ts`); `TrustBadge` (`app/components/TrustBadge.tsx`).
- Produces:
  - `ConceptPopoverProvider({ children }: { children: React.ReactNode })`
  - `useConceptPopover(): (slug: string, anchor: DOMRect) => void`
  - `NarrativeText({ narrative, className }: { narrative: string; className?: string })`
  Task 4 wraps the answer area in the provider and renders `NarrativeText`.

- [ ] **Step 1: Create `app/components/ConceptPopover.tsx`**

```tsx
"use client";

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { getConcept } from "@/app/lib/concepts";
import { computePopoverPosition } from "@/app/lib/linkify";
import { TrustBadge } from "@/app/components/TrustBadge";

type OpenFn = (slug: string, anchor: DOMRect) => void;

const PopoverContext = createContext<OpenFn>(() => {});
export const useConceptPopover = (): OpenFn => useContext(PopoverContext);

interface PopState {
  slug: string;
  anchor: DOMRect;
}

export function ConceptPopoverProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PopState | null>(null);
  const open: OpenFn = (slug, anchor) => setState({ slug, anchor });
  return (
    <PopoverContext.Provider value={open}>
      {children}
      {state && (
        <ConceptPopover
          key={`${state.slug}-${state.anchor.top}-${state.anchor.left}`}
          slug={state.slug}
          anchor={state.anchor}
          onClose={() => setState(null)}
        />
      )}
    </PopoverContext.Provider>
  );
}

const POPOVER_WIDTH = 288; // matches w-72

function ConceptPopover({ slug, anchor, onClose }: { slug: string; anchor: DOMRect; onClose: () => void }) {
  const concept = getConcept(slug);
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  // Measure the rendered popover, then place it (below / flip-up / clamp). Hidden until then.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { top, left } = computePopoverPosition(
      { top: anchor.top, bottom: anchor.bottom, left: anchor.left, width: anchor.width },
      { width: el.offsetWidth, height: el.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPos({ top, left });
  }, [anchor]);

  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const close = () => {
      setShow(false);
      window.setTimeout(onClose, 150); // matches the transition duration
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
    };
    window.addEventListener("keydown", onKey);
    // Defer the outside-click listener so the click that opened the popover doesn't close it.
    const tid = window.setTimeout(() => window.addEventListener("mousedown", onDown), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
      window.clearTimeout(tid);
    };
  }, [onClose]);

  if (typeof document === "undefined" || !concept) return null;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={`concept-pop-${slug}`}
      style={{
        position: "fixed",
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: POPOVER_WIDTH,
        visibility: pos ? "visible" : "hidden",
      }}
      className={`z-50 rounded-xl border border-ink/15 bg-white/95 p-4 shadow-xl backdrop-blur-sm transition duration-150 ease-out motion-reduce:transition-none ${
        show ? "scale-100 opacity-100" : "scale-95 opacity-0"
      }`}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <span id={`concept-pop-${slug}`} className="font-grotesk text-sm font-bold text-ink">
          {concept.term}
        </span>
        <TrustBadge badge={concept.badge} />
      </div>
      <p className="mb-3 font-lastik text-sm leading-snug text-ink/80">{concept.summary}</p>
      <Link
        href={`/learn/${slug}`}
        className="cta-grow relative inline-block font-grotesk text-xs font-semibold uppercase tracking-wide text-accent"
      >
        Read more →
      </Link>
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Create `app/components/NarrativeText.tsx`**

```tsx
"use client";

import { getConcept } from "@/app/lib/concepts";
import { linkifyNarrative } from "@/app/lib/linkify";
import { useConceptPopover } from "@/app/components/ConceptPopover";

// Renders a prediction narrative, turning recognized concept terms into in-context links
// (M6-B). Plain text renders exactly as before; only matched terms become buttons.
export function NarrativeText({ narrative, className }: { narrative: string; className?: string }) {
  const open = useConceptPopover();
  const segments = linkifyNarrative(narrative);
  return (
    <p className={className}>
      {segments.map((seg, i) =>
        typeof seg === "string" ? (
          seg
        ) : (
          <button
            key={i}
            type="button"
            aria-label={getConcept(seg.slug)?.term ?? seg.text}
            onClick={(e) => open(seg.slug, e.currentTarget.getBoundingClientRect())}
            className="cta-grow relative font-medium text-accent"
          >
            {seg.text}
          </button>
        ),
      )}
    </p>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add app/components/ConceptPopover.tsx app/components/NarrativeText.tsx
git commit -m "feat: concept popover provider + NarrativeText link renderer"
```

---

### Task 4: Wire into the four answer cards

**Files:**
- Modify: `app/page.tsx` (import + provider wrap + 4 narrative blocks)

**Interfaces:**
- Consumes: `ConceptPopoverProvider`, `NarrativeText` (Task 3).
- Produces: the live feature — clickable concept links in all four answer cards.

- [ ] **Step 1: Add imports**

In `app/page.tsx`, add to the import block near the other component imports:

```tsx
import { ConceptPopoverProvider } from "@/app/components/ConceptPopover";
import { NarrativeText } from "@/app/components/NarrativeText";
```

- [ ] **Step 2: Replace the four narrative `<p>` blocks**

In each of `PodiumLineup`, `PaceCard`, `StrategyCard`, and `StatAnswer`, replace the line:

```tsx
<p className={`max-w-xl font-lastik text-lg leading-relaxed text-ink/90 ${LEGIBLE} px-4 py-2`}>{narrative}</p>
```

with:

```tsx
<NarrativeText narrative={narrative} className={`max-w-xl font-lastik text-lg leading-relaxed text-ink/90 ${LEGIBLE} px-4 py-2`} />
```

(All four blocks are identical today — confirm with `grep -n "font-lastik text-lg leading-relaxed" app/page.tsx`, which should show exactly the four card lines plus none other. Replace those four.)

- [ ] **Step 3: Wrap the answer area in the provider**

Find the container that renders the answer cards (the block containing the `{answer && "supported" in answer …}` conditionals, around `app/page.tsx:343-360`). Wrap that group of answer conditionals in `<ConceptPopoverProvider>…</ConceptPopoverProvider>`. The loading line, empty state, and error state may sit inside or outside the provider — placing the whole results region inside is simplest and harmless. Ensure the JSX remains a single valid tree (the provider needs one parent element or fragment around the wrapped children).

Example shape:

```tsx
<ConceptPopoverProvider>
  {loading && (
    <p className={`fog-in font-pixel text-3xl tracking-wide text-ink/75 ${LEGIBLE} px-4 py-2`}>{loadingLine}</p>
  )}
  {answer && "supported" in answer && answer.supported && "facts" in answer && (
    <StatAnswer facts={answer.facts} narrative={answer.narrative} />
  )}
  {/* …the other three card conditionals, the unsupported, and the error blocks… */}
</ConceptPopoverProvider>
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: build succeeds, no errors. (`NarrativeText`/`ConceptPopover` are client components; `app/page.tsx` is already `"use client"`, so SSR is fine.)

- [ ] **Step 6: Full test sweep**

Run: `npx vitest run`
Expected: all vitest pass (existing + the new `concepts.test.ts` and `linkify.test.ts`).

Run: `PYTHONPATH=. .venv/bin/python -m pytest -q`
Expected: all pytest pass (unchanged — no Python touched).

- [ ] **Step 7: Commit**

```bash
git add app/page.tsx
git commit -m "feat: render concept links in the four answer narratives"
```

---

## Manual verification (after Task 4, before any merge)

Per the codebase's frontend-verification pattern (live preview eyeball, not render tests):

1. `npm run dev`, ask a strategy query (e.g. *"What's the strategy for the 2024 Italian Grand Prix?"*). Confirm a term like "tyre deg"/"pit stop" is underlined-on-hover and clickable.
2. Click it → popover appears anchored at the word, showing term + TrustBadge + summary + "Read more →".
3. "Read more →" navigates to `/learn/<slug>`.
4. `Esc` and outside-click both dismiss; clicking a different term moves the popover.
5. Near the bottom of the viewport, the popover flips above the word; near screen edges it stays on-screen.
6. With OS "reduce motion" on, the popover appears instantly (no fade/scale).
7. A narrative with no concept terms renders identically to before (no buttons).

---

## Self-Review (completed by plan author)

- **Spec coverage:** aliases data (Task 1 ✓), deterministic longest-match/word-boundary/first-occurrence linker (Task 2 ✓), pure positioning math (Task 2 ✓), provider+hook+NarrativeText (Task 3 ✓), popover with portal/TrustBadge/summary/Read-more/dismiss/a11y/reduced-motion (Task 3 ✓), wiring into the 4 cards (Task 4 ✓), node-only testing + build/tsc/live verification (Tasks 1–4 + manual ✓), scope limited to 4 narratives (Task 4 ✓).
- **Placeholder scan:** none. The one deliberate "remove this import" step (Task 3 Step 2) is explicit and self-correcting, not a TODO.
- **Type consistency:** `Segment`, `linkifyNarrative`, `computePopoverPosition`, `useConceptPopover`, `ConceptPopoverProvider`, `NarrativeText` names/signatures match across Tasks 2→3→4. `Concept.aliases: string[]` (Task 1) is consumed by `ALIASES` (Task 2).
