import { NextResponse } from "next/server";
import { getClient } from "@/app/lib/anthropic";
import { parseQuery } from "@/app/lib/parser";
import { generateNarrative, type StatFacts } from "@/app/lib/narrative";
import { answerQuery } from "@/app/lib/orchestrate";

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
        lookup: async (stat, gp): Promise<StatFacts> => {
          const res = await fetch(`${origin}/api/inference`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ stat, gp }),
          });
          if (!res.ok) throw new Error(`inference endpoint returned ${res.status}`);
          return (await res.json()) as StatFacts;
        },
        narrate: (facts) => generateNarrative(client, facts),
      },
      query,
    );
    return NextResponse.json(answer);
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
