"use client";

import { useState } from "react";
import { DriverGlyph } from "@/app/components/DriverGlyph";
import type { Answer as ApiAnswer } from "@/app/lib/orchestrate";
import type { PodiumFacts, StatFacts } from "@/app/lib/narrative";

// The /api/ask response is the orchestrator's Answer, plus a client-side error shape.
type Answer = ApiAnswer | { error: string };

const BAND_TEXT: Record<string, string> = {
  strong: "text-emerald-600",
  "in contention": "text-amber-600",
  "outside shot": "text-slate-400",
};

/** Top-4 podium as a horizontal helmet lineup — code under each helmet. No box. */
function PodiumLineup({ podium, narrative }: { podium: PodiumFacts; narrative: string }) {
  return (
    <div className="fog-in flex flex-col items-center gap-9 text-center">
      <div className="font-grotesk text-xs uppercase tracking-[0.2em] text-muted">
        {podium.year} {podium.gp} · podium odds
        {podium.mode ? ` · ${podium.mode}` : ""}
      </div>

      {podium.drivers.length > 0 ? (
        <div className="flex items-end justify-center gap-8 sm:gap-12">
          {podium.drivers.slice(0, 4).map((d) => (
            <div key={d.driver} className="flex flex-col items-center gap-1.5">
              <DriverGlyph code={d.driver} team={d.team} size={92} />
              <div className="mt-1 font-grotesk text-xl font-bold tracking-wide text-ink">{d.driver}</div>
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
      <div className="text-7xl font-bold tracking-tight text-ink">
        {facts.value}
        <span className="ml-1 text-3xl text-muted">{facts.units}</span>
      </div>
      <p className="max-w-xl font-lastik text-lg leading-relaxed text-ink/90">{narrative}</p>
      <p className="font-grotesk text-[11px] uppercase tracking-wide text-muted">Source: {facts.source}</p>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("Who is likely to podium at the 2024 Italian Grand Prix?");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [loading, setLoading] = useState(false);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAnswer(null);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      setAnswer(await res.json());
    } catch {
      setAnswer({ error: "request failed" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center gap-12 px-6 py-24">
      <form onSubmit={ask} className="flex w-full max-w-xl gap-2">
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

      <div className="flex w-full justify-center">
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
      </div>
    </main>
  );
}
