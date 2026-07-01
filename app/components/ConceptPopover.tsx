"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { getConcept } from "@/app/lib/concepts";
import { computePopoverPosition } from "@/app/lib/linkify";
import { TrustBadge } from "@/app/components/TrustBadge";
import { parsePopoverKey } from "@/app/lib/entity-whats";

type OpenFn = (slug: string, anchor: DOMRect) => void;

const PopoverContext = createContext<OpenFn>(() => {});
export const useConceptPopover = (): OpenFn => useContext(PopoverContext);

interface PopState {
  slug: string;
  anchor: DOMRect;
}

export function ConceptPopoverProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PopState | null>(null);
  const open = useCallback<OpenFn>((slug, anchor) => setState({ slug, anchor }), []);
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
  const parsed = parsePopoverKey(slug);
  const concept = parsed?.kind === "concept" ? getConcept(parsed.slug) : undefined;
  const ref = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
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
      closeTimer.current = window.setTimeout(onClose, 150); // matches the transition duration
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
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, [onClose]);

  if (typeof document === "undefined" || parsed === null) return null;
  if (parsed.kind === "concept" && !concept) return null;

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
      {parsed.kind === "concept" && concept ? (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span id={`concept-pop-${slug}`} className="font-grotesk text-sm font-bold text-ink">
              {concept.term}
            </span>
            <TrustBadge badge={concept.badge} />
          </div>
          <p className="mb-3 font-lastik text-sm leading-snug text-ink/80">{concept.summary}</p>
          <Link
            href={`/learn/${parsed.slug}`}
            className="cta-grow relative inline-block font-grotesk text-xs font-semibold uppercase tracking-wide text-accent"
          >
            Read more →
          </Link>
        </>
      ) : parsed.kind === "entity" ? (
        <>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span id={`concept-pop-${slug}`} className="font-grotesk text-sm font-bold text-ink">
              {parsed.what.title}
            </span>
            <TrustBadge badge={parsed.what.badge} />
          </div>
          <p className="mb-3 font-lastik text-sm leading-snug text-ink/80">{parsed.what.summary}</p>
          <a
            href={parsed.what.source.url}
            target="_blank"
            rel="noreferrer"
            className="cta-grow relative inline-block font-grotesk text-xs font-semibold uppercase tracking-wide text-accent"
          >
            Source: {parsed.what.source.label} →
          </a>
        </>
      ) : null}
    </div>,
    document.body,
  );
}
