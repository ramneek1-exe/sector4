"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AsciiFog } from "@/app/components/AsciiFog";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import { LOADING_LINES, pickLoadingLine } from "@/app/lib/loading-lines";
import { TyreSpinner } from "@/app/components/TyreSpinner";
import { QueryChips } from "@/app/components/QueryChips";
import type { Answer as ApiAnswer } from "@/app/lib/orchestrate";
import type { PodiumFacts, StatFacts, PaceFacts, StrategyFacts } from "@/app/lib/narrative";
import { BAND_TEXT } from "@/app/lib/bands";

// The /api/ask response is the orchestrator's Answer, plus a client-side error shape.
type Answer = ApiAnswer | { error: string };

// Interleaved by kind (podium → strategy → pace → lookup, repeating) so consecutive
// chips are always a different type — the picker cycles this array in order.
const EXAMPLES = [
  "Who is likely to podium at the 2024 Italian Grand Prix?",
  "Stop strategy for the 2024 Bahrain Grand Prix",
  "Long-run pace at the 2024 Spanish Grand Prix",
  "How fast do tyres wear at Bahrain?",
  "Monza 2025 podium",
  "One-stop or two at Hungary 2024?",
  "Race pace gaps at Abu Dhabi 2024",
  "How much time is lost in the pit lane at Monaco?",
  "Las Vegas 2024 podium",
  "How many stops at Spain in 2024?",
  "Who's fastest over a stint at Monza 2024?",
  "How long do stints last at Spain?",
];

// Subtle white backing so text stays legible over the fog — feathered to transparent,
// no defined shape/border (edgeless, like the fog itself). See `.legible` in globals.css.
const LEGIBLE = "legible";

/** Top-4 podium as a horizontal helmet lineup — ASCII helmet + code under each. No box. */
function PodiumLineup({ podium, narrative }: { podium: PodiumFacts; narrative: string }) {
  return (
    <div className="fog-in flex flex-col items-center gap-9 text-center">
      <div className={`font-pixel-serif text-sm tracking-[0.12em] text-muted ${LEGIBLE} px-3 py-1`}>
        {podium.year} {podium.gp} · podium odds
        {podium.mode ? ` · ${podium.mode}` : ""}
      </div>

      {podium.drivers.length > 0 ? (
        <div className="flex items-end justify-center gap-6 sm:gap-10">
          {podium.drivers.slice(0, 4).map((d) => (
            <div key={d.driver} className="flex flex-col items-center gap-1.5">
              <AsciiGlyph code={d.driver} team={d.team} size={96} />
              <div className="mt-2 font-grotesk text-xl font-bold tracking-wide text-ink">{d.driver}</div>
              <div
                className={`font-grotesk text-[11px] font-semibold uppercase tracking-wide ${
                  BAND_TEXT[d.band] ?? BAND_TEXT["outside shot"]
                }`}
              >
                {d.band}
              </div>
              <div className="font-mono text-[11px] text-muted">p≈{d.p_podium}</div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted">{podium.reason ?? "Not enough data for this weekend yet."}</p>
      )}

      <p className={`max-w-xl font-lastik text-lg leading-relaxed text-ink/90 ${LEGIBLE} px-4 py-2`}>{narrative}</p>
      <p className={`max-w-md font-grotesk text-[11px] text-muted ${LEGIBLE} px-3 py-1.5`}>
        Honest bands, not precise %s — the p values are the model’s raw probabilities and are not yet
        calibrated
        {typeof podium.n_train_races === "number" && ` · trained on ${podium.n_train_races} prior weekends`}.
      </p>
    </div>
  );
}

/** Pace-gap answer: ranked helmets fastest-first with delta + uncertainty. Supporting, not a podium. */
function PaceCard({ pace, narrative }: { pace: PaceFacts; narrative: string }) {
  return (
    <div className="fog-in flex flex-col items-center gap-9 text-center">
      <div className={`font-pixel-serif text-sm tracking-[0.12em] text-muted ${LEGIBLE} px-3 py-1`}>
        {pace.year} {pace.gp} · long-run pace gaps
      </div>
      {pace.drivers.length > 0 ? (
        <div className="flex items-end justify-center gap-6 sm:gap-10">
          {pace.drivers.slice(0, 5).map((d) => (
            <div key={d.driver} className="flex flex-col items-center gap-1.5">
              <AsciiGlyph code={d.driver} team={d.team} size={88} />
              <div className="mt-2 font-grotesk text-lg font-bold tracking-wide text-ink">{d.driver}</div>
              <div className={`font-mono text-sm font-semibold text-ink/85 ${LEGIBLE} px-2 py-0.5`}>
                {d.pace_delta_s > 0 ? "+" : ""}
                {d.pace_delta_s}s<span className="font-medium text-ink/55"> ±{d.uncertainty_s}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted">{pace.reason ?? "Not enough data for this weekend yet."}</p>
      )}
      <p className={`max-w-xl font-lastik text-lg leading-relaxed text-ink/90 ${LEGIBLE} px-4 py-2`}>{narrative}</p>
      <p className={`max-w-md font-grotesk text-[11px] text-muted ${LEGIBLE} px-3 py-1.5`}>
        Supporting context — long-run pace gaps and their uncertainty, not a podium or result prediction
        {typeof pace.n_train_races === "number" && ` · trained on ${pace.n_train_races} prior weekends`}.
      </p>
    </div>
  );
}

/** Compact, scrollable modal of every driver's predicted stops. Click the backdrop or
 *  press Escape to dismiss; fixed-position so it never stretches the card or the fog. */
function DriverStopsModal({ strategy, onClose }: { strategy: StrategyFacts; onClose: () => void }) {
  // `show` drives the enter/exit transition; closing fades out THEN unmounts (via onClose).
  const [show, setShow] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShow(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const close = () => {
    setShow(false);
    window.setTimeout(onClose, 180); // matches the transition duration
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Per-driver stop strategy for the ${strategy.year} ${strategy.gp}`}
      onClick={close}
      className={`fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
        show ? "opacity-100" : "opacity-0"
      }`}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex max-h-[70vh] w-full max-w-sm flex-col rounded-2xl border border-ink/15 bg-white/95 shadow-xl transition duration-200 ease-out motion-reduce:transition-none ${
          show ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink/10 px-4 py-2.5">
          <div className="font-grotesk text-[11px] font-semibold uppercase tracking-wide text-muted">
            {strategy.year} {strategy.gp} · per-driver stops
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="rounded-full px-2 py-0.5 font-grotesk text-sm text-muted transition hover:bg-ink/5 hover:text-ink"
          >
            ✕
          </button>
        </div>
        <div className="grid min-h-0 grid-cols-3 gap-x-2 gap-y-4 overflow-y-auto p-4 sm:grid-cols-4">
          {strategy.drivers.map((d) => (
            <div key={d.driver} className="flex flex-col items-center gap-0.5">
              <AsciiGlyph code={d.driver} team={d.team} size={42} />
              <div className="font-grotesk text-[11px] font-bold text-ink">{d.driver}</div>
              <div className="font-mono text-[11px] font-semibold leading-tight text-ink/85">
                {d.n_stops}-stop<span className="font-medium text-ink/55"> · {Math.round(d.confidence * 100)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Strategy answer: race-level stop call first, then deg->stops narrative, SC caveat, secondary per-driver. */
function StrategyCard({ strategy, narrative }: { strategy: StrategyFacts; narrative: string }) {
  const dom = strategy.dominant;
  const [open, setOpen] = useState(false);
  return (
    <div className="fog-in flex flex-col items-center gap-7 text-center">
      <div className={`font-pixel-serif text-sm tracking-[0.12em] text-muted ${LEGIBLE} px-3 py-1`}>
        {strategy.year} {strategy.gp} · stop-count strategy
      </div>
      {dom ? (
        <div className={`font-pixel-serif text-5xl font-bold tracking-tight text-ink ${LEGIBLE} px-5 py-2`}>
          Mostly a {dom.n_stops}-stop
          <span className="ml-2 align-middle font-mono text-base text-muted">{Math.round(dom.share * 100)}% of the grid</span>
        </div>
      ) : (
        <p className="text-muted">{strategy.reason ?? "Not enough data for this weekend yet."}</p>
      )}
      <p className={`max-w-xl font-lastik text-lg leading-relaxed text-ink/90 ${LEGIBLE} px-4 py-2`}>{narrative}</p>
      <p className={`max-w-lg font-grotesk text-[11px] text-amber-700 ${LEGIBLE} px-3 py-1.5`}>{strategy.sc_caveat}</p>
      {strategy.drivers.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-ink/25 bg-white/90 px-4 py-2 font-grotesk text-xs font-semibold uppercase tracking-wide text-ink/75 shadow-sm backdrop-blur transition hover:border-accent hover:text-ink"
        >
          Per-driver detail
        </button>
      )}
      {open && <DriverStopsModal strategy={strategy} onClose={() => setOpen(false)} />}
    </div>
  );
}

/** Computed-stat answer (e.g. pit-loss). No box. */
function StatAnswer({ facts, narrative }: { facts: StatFacts; narrative: string }) {
  return (
    <div className="fog-in flex flex-col items-center gap-4 text-center">
      {facts.value !== null && (
        <div className={`font-pixel-serif text-7xl font-bold tracking-tight text-ink ${LEGIBLE} px-5 py-2`}>
          {facts.value}
          <span className="ml-1 text-3xl text-muted">{facts.units}</span>
        </div>
      )}
      <p className={`max-w-xl font-lastik text-lg leading-relaxed text-ink/90 ${LEGIBLE} px-4 py-2`}>{narrative}</p>
      <p className={`font-grotesk text-[11px] uppercase tracking-wide text-muted ${LEGIBLE} px-3 py-1`}>Source: {facts.source}</p>
    </div>
  );
}

/** Pre-query state: a hint + example queries, sitting in the same fog as the answers. */
function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="fog-in absolute inset-0 flex flex-col items-center justify-center gap-5 text-center">
      <p className={`max-w-md font-lastik text-lg text-ink/70 ${LEGIBLE} px-4 py-2`}>
        Ask about a 2024–25 race weekend — honest podium odds, strategy, and the numbers behind them.
      </p>
      <QueryChips examples={EXAMPLES} onPick={onPick} />
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingLine, setLoadingLine] = useState(LOADING_LINES[0]);

  async function run(q: string) {
    setLoading(true);
    setLoadingLine(pickLoadingLine());
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      setAnswer(await res.json());
    } catch {
      setAnswer({ error: "request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-10 px-6 py-24">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(query);
        }}
        className="flex w-full max-w-xl gap-2"
      >
        <div className="bar-shell flex-1">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-12 w-full rounded-full border border-ink/15 bg-white px-5 font-grotesk text-sm text-ink shadow-sm outline-none transition placeholder:text-muted hover:border-accent/70 hover:-translate-y-px focus:border-accent motion-reduce:hover:translate-y-0"
            placeholder="Ask about a race weekend…"
          />
        </div>
        <button
          className={`relative inline-flex h-12 items-center justify-center overflow-hidden rounded-full px-7 font-grotesk text-lg font-medium shadow-sm transition duration-200 motion-reduce:hover:translate-y-0 ${
            loading
              ? "bg-[#f3f3f3] text-ink"
              : "bg-accent text-white hover:-translate-y-px hover:bg-[#1b39b0]"
          }`}
          disabled={loading}
          aria-busy={loading}
        >
          {/* Label stays in the DOM (invisible while loading) to hold the button width. */}
          <span className={`block transition-opacity duration-200 ${loading ? "opacity-0" : "opacity-100"}`}>
            Ask
          </span>
          <TyreSpinner active={loading} size={30} />
        </button>
      </form>

      {/* Action zone — the ONLY place the living ASCII fog animates, directly under the bar. */}
      <section className="relative flex min-h-[600px] w-full items-center justify-center">
        <div className="pointer-events-none absolute left-1/2 top-1/2 -z-10 h-[760px] w-screen max-w-[1500px] -translate-x-1/2 -translate-y-1/2 [mask-image:radial-gradient(ellipse_70%_64%_at_50%_50%,black_0%,transparent_72%)]">
          <AsciiFog className="h-full w-full" />
        </div>
        {/* Soft light behind the content so text reads over the fog — boxless, no card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[5] [background:radial-gradient(ellipse_46%_50%_at_50%_50%,rgba(250,250,250,0.74),rgba(250,250,250,0.3)_55%,transparent_75%)]"
        />

        {!answer && !loading && (
          <EmptyState
            onPick={(q) => {
              setQuery(q);
              void run(q);
            }}
          />
        )}
        {loading && (
          <p className={`fog-in font-pixel text-3xl tracking-wide text-ink/75 ${LEGIBLE} px-4 py-2`}>{loadingLine}</p>
        )}
        {answer && "supported" in answer && answer.supported && "facts" in answer && (
          <StatAnswer facts={answer.facts} narrative={answer.narrative} />
        )}
        {answer && "supported" in answer && answer.supported && "podium" in answer && (
          <PodiumLineup podium={answer.podium} narrative={answer.narrative} />
        )}
        {answer && "supported" in answer && answer.supported && "pace" in answer && (
          <PaceCard pace={answer.pace} narrative={answer.narrative} />
        )}
        {answer && "supported" in answer && answer.supported && "strategy" in answer && (
          <StrategyCard strategy={answer.strategy} narrative={answer.narrative} />
        )}
        {answer && "supported" in answer && !answer.supported && (
          <p className={`fog-in max-w-xl text-center font-lastik text-lg text-muted ${LEGIBLE} px-4 py-2`}>{answer.message}</p>
        )}
        {answer && "error" in answer && (
          <p className={`fog-in text-center font-grotesk text-red-600 ${LEGIBLE} px-4 py-2`}>Error: {answer.error}</p>
        )}
      </section>
    </main>
  );
}
