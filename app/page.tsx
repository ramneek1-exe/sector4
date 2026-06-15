"use client";

import { useState } from "react";
import { Reveal } from "@/app/components/Reveal";

type Answer =
  | { supported: true; facts: { gp: string; value: number; units: string; source: string }; narrative: string }
  | { supported: false; message: string }
  | { error: string };

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
          {answer && "supported" in answer && answer.supported && (
            <div className="rounded border border-zinc-800 p-5">
              <div className="text-4xl font-bold">
                {answer.facts.value}
                <span className="ml-1 text-lg text-zinc-400">{answer.facts.units}</span>
              </div>
              <p className="mt-3 text-zinc-300">{answer.narrative}</p>
              <p className="mt-3 text-xs text-zinc-600">Source: {answer.facts.source}</p>
            </div>
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
