"use client";

import { useState } from "react";
import { Reveal } from "@/app/components/Reveal";
import { DriverGlyph } from "@/app/components/DriverGlyph";
import type { Answer as ApiAnswer } from "@/app/lib/orchestrate";
import type { PodiumFacts } from "@/app/lib/narrative";

// The /api/ask response is the orchestrator's Answer, plus a client-side error shape.
type Answer = ApiAnswer | { error: string };

const BAND_STYLE: Record<string, string> = {
  strong: "bg-emerald-100 text-emerald-800 border-emerald-300",
  "in contention": "bg-amber-100 text-amber-800 border-amber-300",
  "outside shot": "bg-slate-100 text-slate-500 border-slate-300",
};

function PodiumCard({ podium, narrative }: { podium: PodiumFacts; narrative: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-baseline justify-between">
        <h2 className="font-grotesk text-lg font-bold tracking-tight text-ink">
          {podium.year} {podium.gp} — podium odds
        </h2>
        {podium.mode && (
          <span className="text-xs uppercase tracking-wide text-muted">{podium.mode}</span>
        )}
      </div>

      {podium.drivers.length > 0 ? (
        <ol className="mt-4 space-y-2">
          {podium.drivers.slice(0, 6).map((d) => (
            <li key={d.driver} className="flex items-center gap-3">
              <span className="w-5 text-right font-mono text-sm tabular-nums text-muted">{d.rank}</span>
              <DriverGlyph code={d.driver} team={d.team} />
              <span
                className={`rounded border px-2 py-0.5 font-grotesk text-xs font-medium ${
                  BAND_STYLE[d.band] ?? BAND_STYLE["outside shot"]
                }`}
              >
                {d.band}
              </span>
              <span className="ml-auto font-mono text-xs tabular-nums text-muted">p≈{d.p_podium}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-muted">
          {podium.reason ?? "Not enough data for this weekend yet."}
        </p>
      )}

      <p className="mt-4 text-ink">{narrative}</p>
      <p className="mt-3 text-xs text-muted">
        Honest bands, not precise %s — the p values are the model’s raw probabilities and are
        <span className="text-muted"> not yet calibrated</span>
        {typeof podium.n_train_races === "number" && ` · trained on ${podium.n_train_races} prior weekends`}.
      </p>
    </div>
  );
}

export default function Home() {
  const [query, setQuery] = useState("How much time is lost in the pit lane at Monaco?");
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
    <main className="mx-auto max-w-2xl px-6 py-16">
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded border border-slate-300 bg-white text-ink px-3 py-2 text-sm outline-none focus:border-accent"
          placeholder="Ask about a race weekend…"
        />
        <button className="rounded bg-accent px-4 py-2 text-sm font-medium text-white" disabled={loading}>
          {loading ? "…" : "Ask"}
        </button>
      </form>

      <div className="mt-10">
        <Reveal active={loading || answer !== null}>
          {answer && "supported" in answer && answer.supported && "facts" in answer && (
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-4xl font-bold text-ink">
                {answer.facts.value}
                <span className="ml-1 text-lg text-muted">{answer.facts.units}</span>
              </div>
              <p className="mt-3 text-ink">{answer.narrative}</p>
              <p className="mt-3 text-xs text-muted">Source: {answer.facts.source}</p>
            </div>
          )}
          {answer && "supported" in answer && answer.supported && "podium" in answer && (
            <PodiumCard podium={answer.podium} narrative={answer.narrative} />
          )}
          {answer && "supported" in answer && !answer.supported && (
            <p className="text-muted">{answer.message}</p>
          )}
          {answer && "error" in answer && <p className="text-red-600">Error: {answer.error}</p>}
        </Reveal>
      </div>
    </main>
  );
}
