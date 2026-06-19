"use client";

import { useState } from "react";
import { AsciiFog } from "@/app/components/AsciiFog";
import { AsciiGlyph } from "@/app/components/AsciiGlyph";
import type { Answer as ApiAnswer } from "@/app/lib/orchestrate";
import type { PodiumFacts, StatFacts } from "@/app/lib/narrative";

// The /api/ask response is the orchestrator's Answer, plus a client-side error shape.
type Answer = ApiAnswer | { error: string };

const BAND_TEXT: Record<string, string> = {
  strong: "text-emerald-600",
  "in contention": "text-amber-600",
  "outside shot": "text-slate-400",
};

const EXAMPLES = [
  "Who is likely to podium at the 2024 Italian Grand Prix?",
  "Monza 2025 podium",
  "How much time is lost in the pit lane at Monaco?",
];

/** Top-4 podium as a horizontal helmet lineup — ASCII helmet + code under each. No box. */
function PodiumLineup({ podium, narrative }: { podium: PodiumFacts; narrative: string }) {
  return (
    <div className="fog-in flex flex-col items-center gap-9 text-center">
      <div className="font-pixel-serif text-sm tracking-[0.12em] text-muted">
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

      <p className="max-w-xl font-lastik text-lg leading-relaxed text-ink/90">{narrative}</p>
      <p className="max-w-md font-grotesk text-[11px] text-muted">
        Honest bands, not precise %s — the p values are the model’s raw probabilities and are not yet
        calibrated
        {typeof podium.n_train_races === "number" && ` · trained on ${podium.n_train_races} prior weekends`}.
      </p>
    </div>
  );
}

/** Computed-stat answer (e.g. pit-loss). No box. */
function StatAnswer({ facts, narrative }: { facts: StatFacts; narrative: string }) {
  return (
    <div className="fog-in flex flex-col items-center gap-4 text-center">
      <div className="font-pixel-serif text-7xl font-bold tracking-tight text-ink">
        {facts.value}
        <span className="ml-1 text-3xl text-muted">{facts.units}</span>
      </div>
      <p className="max-w-xl font-lastik text-lg leading-relaxed text-ink/90">{narrative}</p>
      <p className="font-grotesk text-[11px] uppercase tracking-wide text-muted">Source: {facts.source}</p>
    </div>
  );
}

/** Pre-query state: a hint + example queries, sitting in the same fog as the answers. */
function EmptyState({ onPick }: { onPick: (q: string) => void }) {
  return (
    <div className="fog-in flex flex-col items-center gap-5 text-center">
      <p className="max-w-md font-lastik text-lg text-ink/70">
        Ask about a 2024–25 race weekend — honest podium odds, strategy, and the numbers behind them.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onPick(q)}
            className="rounded-full border border-white/60 bg-white/45 px-4 py-1.5 font-grotesk text-xs text-muted backdrop-blur transition hover:border-accent hover:text-ink"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState(EXAMPLES[0]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(q: string) {
    setLoading(true);
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
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded-full border border-white/50 bg-white/55 px-5 py-3 font-grotesk text-sm text-ink shadow-sm outline-none backdrop-blur placeholder:text-muted focus:border-accent"
          placeholder="Ask about a race weekend…"
        />
        <button
          className="rounded-full bg-accent px-6 py-3 font-grotesk text-sm font-medium text-white shadow-sm transition hover:bg-accent-bright disabled:opacity-60"
          disabled={loading}
        >
          {loading ? "…" : "Ask"}
        </button>
      </form>

      {/* Action zone — the ONLY place the living ASCII fog animates, directly under the bar. */}
      <section className="relative flex min-h-[440px] w-full items-center justify-center">
        <div className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_62%_70%_at_50%_42%,black,transparent_78%)]">
          <AsciiFog className="h-full w-full" />
        </div>
        {/* Soft light behind the content so text reads over the fog — boxless, no card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-[5] [background:radial-gradient(ellipse_46%_50%_at_50%_50%,rgba(250,250,250,0.88),rgba(250,250,250,0.4)_55%,transparent_75%)]"
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
          <p className="fog-in font-grotesk text-sm uppercase tracking-[0.2em] text-muted">Reading the weekend…</p>
        )}
        {answer && "supported" in answer && answer.supported && "facts" in answer && (
          <StatAnswer facts={answer.facts} narrative={answer.narrative} />
        )}
        {answer && "supported" in answer && answer.supported && "podium" in answer && (
          <PodiumLineup podium={answer.podium} narrative={answer.narrative} />
        )}
        {answer && "supported" in answer && !answer.supported && (
          <p className="fog-in max-w-xl text-center font-lastik text-lg text-muted">{answer.message}</p>
        )}
        {answer && "error" in answer && (
          <p className="fog-in text-center font-grotesk text-red-600">Error: {answer.error}</p>
        )}
      </section>
    </main>
  );
}
