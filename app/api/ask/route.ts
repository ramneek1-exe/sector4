import { NextResponse } from "next/server";
import { getClient } from "@/app/lib/anthropic";
import { parseQuery } from "@/app/lib/parser";
import {
  generateNarrative,
  generatePodiumNarrative,
  generatePaceNarrative,
  generateStrategyNarrative,
  type StatFacts,
  type PodiumFacts,
  type PaceFacts,
  type StrategyFacts,
} from "@/app/lib/narrative";
import { answerQuery } from "@/app/lib/orchestrate";

async function postJson<T>(origin: string, path: string, body: unknown): Promise<T> {
  const res = await fetch(`${origin}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} returned ${res.status}`);
  return (await res.json()) as T;
}

export async function POST(req: Request) {
  let query: string;
  try {
    ({ query } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  if (!query || typeof query !== "string") {
    return NextResponse.json({ error: "query is required" }, { status: 400 });
  }

  const origin = new URL(req.url).origin;

  try {
    const client = getClient();
    const answer = await answerQuery(
      {
        parse: (q) => parseQuery(client, q),
        lookup: (stat, gp, year) => postJson<StatFacts>(origin, "/api/inference", { stat, gp, year }),
        narrate: (facts) => generateNarrative(client, facts),
        predictPodium: (year, gp, grid) =>
          postJson<PodiumFacts>(origin, "/api/podium", { year, gp, grid }),
        narratePodium: (facts) => generatePodiumNarrative(client, facts),
        predictPace: (year, gp) => postJson<PaceFacts>(origin, "/api/pace", { year, gp }),
        narratePace: (facts) => generatePaceNarrative(client, facts),
        predictStrategy: (year, gp) => postJson<StrategyFacts>(origin, "/api/strategy", { year, gp }),
        narrateStrategy: (facts) => generateStrategyNarrative(client, facts),
      },
      query,
    );
    return NextResponse.json(answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
