"use client";

import { useState } from "react";
import { Reveal } from "@/app/components/Reveal";
import type { Answer as ApiAnswer } from "@/app/lib/orchestrate";
import type { PodiumFacts } from "@/app/lib/narrative";

// The /api/ask response is the orchestrator's Answer, plus a client-side error shape.
type Answer = ApiAnswer | { error: string };

const BAND_STYLE: Record<string, string> = {
  strong: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  "in contention": "bg-amber-500/15 text-amber-300 border-amber-500/30",
  "outside shot": "bg-zinc-500/10 text-zinc-400 border-zinc-600/40",
};

function PodiumCard({ podium, narrative }: { podium: PodiumFacts; narrative: string }) {
  return (
    <div className="rounded border border-zinc-800 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xl font-bold tracking-tight">
          {podium.year} {podium.gp} — podium odds
        </h2>
        {podium.mode && (
          <span className="text-xs uppercase tracking-wide text-zinc-500">{podium.mode}</span>
        )}
      </div>

      {podium.drivers.length > 0 ? (
        <ol className="mt-4 space-y-1.5">
          {podium.drivers.slice(0, 6).map((d) => (
            <li key={d.driver} className="flex items-center gap-3">
              <span className="w-5 text-right text-sm tabular-nums text-zinc-500">{d.rank}</span>
              <span className="w-12 font-mono text-sm font-semibold">{d.driver}</span>
              <span
                className={`rounded border px-2 py-0.5 text-xs font-medium ${
                  BAND_STYLE[d.band] ?? BAND_STYLE["outside shot"]
                }`}
              >
                {d.band}
              </span>
              <span className="ml-auto text-xs tabular-nums text-zinc-600">p≈{d.p_podium}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-zinc-400">
          {podium.reason ?? "Not enough data for this weekend yet."}
        </p>
      )}

      <p className="mt-4 text-zinc-300">{narrative}</p>
      <p className="mt-3 text-xs text-zinc-600">
        Honest bands, not precise %s — the p values are the model’s raw probabilities and are
        <span className="text-zinc-500"> not yet calibrated</span>
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
      <h1 className="mb-8 text-3xl font-bold tracking-tight">SECTOR 4</h1>
      <form onSubmit={ask} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm outline-none focus:border-zinc-400"
          placeholder="Ask about a race weekend…"
        />
        <button className="rounded bg-zinc-100 px-4 py-2 text-sm font-medium text-black" disabled={loading}>
          {loading ? "…" : "Ask"}
        </button>
      </form>

      <div className="mt-10">
        <Reveal active={loading || answer !== null}>
          {answer && "supported" in answer && answer.supported && "facts" in answer && (
            <div className="rounded border border-zinc-800 p-5">
              <div className="text-4xl font-bold">
                {answer.facts.value}
                <span className="ml-1 text-lg text-zinc-400">{answer.facts.units}</span>
              </div>
              <p className="mt-3 text-zinc-300">{answer.narrative}</p>
              <p className="mt-3 text-xs text-zinc-600">Source: {answer.facts.source}</p>
            </div>
          )}
          {answer && "supported" in answer && answer.supported && "podium" in answer && (
            <PodiumCard podium={answer.podium} narrative={answer.narrative} />
          )}
          {answer && "supported" in answer && !answer.supported && (
            <p className="text-zinc-400">{answer.message}</p>
          )}
          {answer && "error" in answer && <p className="text-red-400">Error: {answer.error}</p>}
        </Reveal>
      </div>
    </main>
  );
}
