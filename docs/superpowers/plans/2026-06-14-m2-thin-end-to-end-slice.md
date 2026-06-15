# M2 — Thin End-to-End Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove the full product architecture with one query — "How much time is lost in the pit lane at Monaco?" — flowing NL → Haiku parser → Python `/api/` → Haiku narrative → ASCII/dither reveal, verified locally via `vercel dev`.

**Architecture:** Next.js (App Router, TS) at repo root. The two Haiku calls (parser + grounded narrative) run in the Next server; the Python serverless function `api/inference.py` is pure inference wrapping the existing `src.inference.lookup` (fastf1-free). A single `<Reveal>` component applies the shaders.com Ascii/Dither resolve to the answer card, with a reduced-motion / no-WebGPU fade fallback.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, GSAP, `shaders` npm (WebGPU), `@anthropic-ai/sdk` (Claude Haiku 4.5), Vitest (TS tests), existing Python `src/` + pytest, Vercel Python runtime.

**Spec:** `docs/superpowers/specs/2026-06-14-m2-thin-end-to-end-slice-design.md`

**Conventions:** Commits are conventional-style, one logical change each, **no AI attribution** (CLAUDE.md). Python tests run with `pytest`; TS tests run with `npx vitest run`. Round every number that reaches output (already handled inside `lookup_stat`).

---

## File Structure

```
src/features/track.py            MODIFY — add curated "Monaco" entry
api/inference.py                 CREATE — Vercel Python fn: pure lookup_stat wrapper
tests/test_api_inference.py      CREATE — tests the pure response helper
tests/test_lookup.py             MODIFY — add Monaco pit_loss assertion

package.json                     CREATE — Next.js app + scripts + deps
next.config.mjs                  CREATE
tsconfig.json                    CREATE
postcss.config.mjs               CREATE
tailwind.config.ts               CREATE
vitest.config.ts                 CREATE
vercel.json                      CREATE — Python fn includeFiles: src/**

app/layout.tsx                   CREATE — root layout
app/globals.css                  CREATE — Tailwind base
app/page.tsx                     CREATE — search UI (client component)
app/api/ask/route.ts             CREATE — TS orchestration endpoint

app/lib/anthropic.ts             CREATE — client factory + model id
app/lib/parser.ts                CREATE — parseQuery (tool-use)
app/lib/parser.test.ts           CREATE
app/lib/narrative.ts             CREATE — generateNarrative (grounded)
app/lib/narrative.test.ts        CREATE
app/lib/orchestrate.ts           CREATE — answerQuery (deps-injected)
app/lib/orchestrate.test.ts      CREATE
app/lib/reveal-fallback.ts       CREATE — shouldUseFallback (pure)
app/lib/reveal-fallback.test.ts  CREATE
app/components/Reveal.tsx        CREATE — shaders.com Ascii/Dither wrapper + fallback

handoff.md                       MODIFY — record M2 progress + deferred deploy
```

---

## Task 1: Curated Monaco track entry (Python)

**Files:**
- Modify: `src/features/track.py:16-33`
- Test: `tests/test_lookup.py` (add one test)

- [ ] **Step 1: Write the failing test**

Add to `tests/test_lookup.py`:

```python
def test_pit_loss_monaco_is_curated():
    out = lookup_stat("pit_loss", "Monaco")
    assert out["value"] == 19.5
    assert out["units"] == "s"
    assert out["source"] == "curated track features"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_lookup.py::test_pit_loss_monaco_is_curated -v`
Expected: FAIL — value is `21.0` (the `_DEFAULTS` fallback), not `19.5`.

- [ ] **Step 3: Add the curated entry**

In `src/features/track.py`, add this entry to the `_TRACKS` dict (after the `"Las Vegas"` line, before the closing `}`):

```python
    # street circuit, short pit lane offset by the reduced 60 kph pit limit
    "Monaco": {"length_km": 3.337, "n_corners": 19, "abrasiveness": 2, "pit_loss_s": 19.5},
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_lookup.py -v`
Expected: PASS (all, including the new Monaco test).

- [ ] **Step 5: Commit**

```bash
git add src/features/track.py tests/test_lookup.py
git commit -m "feat: add curated Monaco track entry for pit-loss lookup"
```

---

## Task 2: Python inference endpoint

**Files:**
- Create: `api/inference.py`
- Test: `tests/test_api_inference.py`

Design: a pure helper `lookup_response(body: dict) -> tuple[int, dict]` holds all logic and is unit-tested; the `handler` class is thin HTTP glue. Imports `lookup_stat` directly from `src.inference.lookup` (not the package `__init__`) so the function does not pull in sklearn (pace/strategy). A `sys.path` bootstrap makes `src` importable when Vercel runs the file as a script.

- [ ] **Step 1: Write the failing test**

Create `tests/test_api_inference.py`:

```python
"""Tests for the Vercel Python inference endpoint (M2)."""
from api.inference import lookup_response


def test_monaco_pit_loss_round_trips():
    status, payload = lookup_response({"stat": "pit_loss", "gp": "Monaco"})
    assert status == 200
    assert payload["value"] == 19.5
    assert payload["units"] == "s"


def test_missing_fields_is_400():
    status, payload = lookup_response({"stat": "pit_loss"})
    assert status == 400
    assert "error" in payload


def test_unknown_stat_is_400():
    status, payload = lookup_response({"stat": "top_speed", "gp": "Monaco"})
    assert status == 400
    assert "error" in payload
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest tests/test_api_inference.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'api'` (or `api.inference`).

- [ ] **Step 3: Write the endpoint**

Create `api/inference.py`:

```python
# api/inference.py
"""Vercel Python serverless function: pure computed-stat lookup (M2).

The only product code path that the Next server calls for inference. Stays
fastf1-free (imports lookup directly, not the inference package, so sklearn is
not pulled in). All logic lives in `lookup_response`; `handler` is HTTP glue.
"""
from __future__ import annotations

import json
import os
import sys
from http.server import BaseHTTPRequestHandler

# Make `src` importable when Vercel runs this file as a standalone script.
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from src.inference.lookup import lookup_stat  # noqa: E402


def lookup_response(body: dict) -> tuple[int, dict]:
    """Map a request body to (status, json-serializable payload)."""
    stat, gp = body.get("stat"), body.get("gp")
    if not stat or not gp:
        return 400, {"error": "stat and gp are required"}
    try:
        return 200, lookup_stat(stat, gp)
    except ValueError as exc:
        return 400, {"error": str(exc)}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):  # noqa: N802 (Vercel/BaseHTTPRequestHandler contract)
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            status, payload = 400, {"error": "invalid JSON body"}
        else:
            status, payload = lookup_response(body)
        encoded = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest tests/test_api_inference.py tests/test_inference_no_fastf1.py -v`
Expected: PASS — including the no-fastf1 invariant (the endpoint must not import fastf1).

- [ ] **Step 5: Commit**

```bash
git add api/inference.py tests/test_api_inference.py
git commit -m "feat: add Python inference endpoint wrapping lookup_stat"
```

---

## Task 3: Next.js + Tailwind + Vitest scaffold

**Files:** `package.json`, `next.config.mjs`, `tsconfig.json`, `postcss.config.mjs`, `tailwind.config.ts`, `vitest.config.ts`, `app/layout.tsx`, `app/globals.css`, `app/page.tsx`

This is a setup task (no TDD). It produces a booting, empty-but-styled app and a working Vitest runner.

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "sector4",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.30.1",
    "gsap": "^3.12.5",
    "next": "14.2.15",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "shaders": "^1.0.0"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "@types/react": "^18.3.3",
    "@types/react-dom": "^18.3.0",
    "autoprefixer": "^10.4.19",
    "postcss": "^8.4.38",
    "tailwindcss": "^3.4.4",
    "typescript": "^5.5.3",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Create `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create `postcss.config.mjs`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: Create `tailwind.config.ts`**

```ts
import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
```

- [ ] **Step 6: Create `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
  },
});
```

- [ ] **Step 7: Create `app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create `app/layout.tsx`**

```tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Sector 4", description: "F1 weekend companion" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-zinc-100 antialiased">{children}</body>
    </html>
  );
}
```

- [ ] **Step 9: Create a placeholder `app/page.tsx`** (replaced in Task 8)

```tsx
export default function Home() {
  return <main className="p-8">Sector 4</main>;
}
```

- [ ] **Step 10: Install and verify the build boots**

Run:
```bash
npm install
npx vitest run        # no tests yet -> "no test files found" is OK (exit 0 or 1; acceptable)
npm run build
```
Expected: `npm run build` completes with a successful compile of the placeholder page.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json next.config.mjs tsconfig.json postcss.config.mjs tailwind.config.ts vitest.config.ts app/layout.tsx app/globals.css app/page.tsx
git commit -m "chore: scaffold Next.js app with Tailwind and Vitest"
```

---

## Task 4: Anthropic client factory

**Files:** Create `app/lib/anthropic.ts`

Setup task — a thin factory. No live test (it only wraps the SDK + reads env); behavior is exercised through the injected-deps tests in Tasks 5–7.

- [ ] **Step 1: Create `app/lib/anthropic.ts`**

```ts
import Anthropic from "@anthropic-ai/sdk";

/** Claude Haiku 4.5 — the single model for both LLM jobs (PRD §7.1). */
export const HAIKU = "claude-haiku-4-5-20251001";

/**
 * Build an Anthropic client. Throws a clear, surfaced error when the key is
 * absent so the route can return a friendly message instead of crashing.
 * Tests never call this — they inject fake clients (the no-key CI path).
 */
export function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is not set");
  }
  return new Anthropic({ apiKey });
}

/** Minimal structural type both real and fake clients satisfy. */
export type LlmClient = {
  messages: {
    create: (args: any) => Promise<{ content: any[] }>;
  };
};
```

- [ ] **Step 2: Commit**

```bash
git add app/lib/anthropic.ts
git commit -m "feat: add Anthropic client factory with Haiku model id"
```

---

## Task 5: Query parser (tool-use)

**Files:** Create `app/lib/parser.ts`, `app/lib/parser.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/parser.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseQuery, ROUTE_TOOL } from "./parser";

function fakeClient(input: Record<string, unknown>) {
  return {
    messages: {
      create: async (_args: any) => ({
        content: [{ type: "tool_use", name: "route_query", input }],
      }),
    },
  };
}

describe("parseQuery", () => {
  it("extracts intent + stat + gp from the tool_use block", async () => {
    const client = fakeClient({ intent: "lookup_stat", stat: "pit_loss", gp: "Monaco" });
    const out = await parseQuery(client, "How much time is lost in the pit lane at Monaco?");
    expect(out).toEqual({ intent: "lookup_stat", stat: "pit_loss", gp: "Monaco" });
  });

  it("forces the route_query tool", async () => {
    let seen: any;
    const client = {
      messages: {
        create: async (args: any) => {
          seen = args;
          return { content: [{ type: "tool_use", name: "route_query", input: { intent: "explain_concept" } }] };
        },
      },
    };
    await parseQuery(client, "what is tyre degradation?");
    expect(seen.tool_choice).toEqual({ type: "tool", name: "route_query" });
    expect(seen.tools[0].name).toBe(ROUTE_TOOL.name);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/parser.test.ts`
Expected: FAIL — `./parser` has no `parseQuery`/`ROUTE_TOOL`.

- [ ] **Step 3: Write `app/lib/parser.ts`**

```ts
import { HAIKU, type LlmClient } from "./anthropic";

export type Intent =
  | "predict_pace"
  | "predict_strategy"
  | "predict_compound"
  | "lookup_stat"
  | "explain_concept";

export type ParsedQuery = { intent: Intent; stat?: string; gp?: string };

export const ROUTE_TOOL = {
  name: "route_query",
  description: "Classify an F1 weekend question into an intent and extract entities.",
  input_schema: {
    type: "object" as const,
    properties: {
      intent: {
        type: "string",
        enum: ["predict_pace", "predict_strategy", "predict_compound", "lookup_stat", "explain_concept"],
      },
      stat: {
        type: "string",
        enum: ["pit_loss", "tyre_deg", "stint_length"],
        description: "Only set for lookup_stat queries.",
      },
      gp: { type: "string", description: "Grand Prix / circuit identifier, e.g. Monaco." },
    },
    required: ["intent"],
  },
};

export async function parseQuery(client: LlmClient, query: string): Promise<ParsedQuery> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 256,
    tools: [ROUTE_TOOL],
    tool_choice: { type: "tool", name: ROUTE_TOOL.name },
    messages: [{ role: "user", content: query }],
  });
  const block = msg.content.find((b: any) => b.type === "tool_use");
  if (!block) throw new Error("parser returned no tool_use block");
  const { intent, stat, gp } = block.input as ParsedQuery;
  return { intent, ...(stat ? { stat } : {}), ...(gp ? { gp } : {}) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/parser.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Commit**

```bash
git add app/lib/parser.ts app/lib/parser.test.ts
git commit -m "feat: add Haiku query parser with strict tool-use routing"
```

---

## Task 6: Grounded narrative generator

**Files:** Create `app/lib/narrative.ts`, `app/lib/narrative.test.ts`

- [ ] **Step 1: Write the failing test**

Create `app/lib/narrative.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { generateNarrative } from "./narrative";

describe("generateNarrative", () => {
  it("passes only the provided facts and returns the text", async () => {
    let seen: any;
    const client = {
      messages: {
        create: async (args: any) => {
          seen = args;
          return { content: [{ type: "text", text: "Monaco loses about 19.5s in the pit lane. Its short pit lane is offset by the reduced 60 kph limit." }] };
        },
      },
    };
    const facts = { stat: "pit_loss", gp: "Monaco", value: 19.5, units: "s", source: "curated track features" };
    const out = await generateNarrative(client, facts);

    expect(out).toContain("19.5");
    // The facts JSON must be present in the user content (grounding).
    const userMsg = seen.messages.find((m: any) => m.role === "user");
    expect(userMsg.content).toContain("19.5");
    expect(userMsg.content).toContain("Monaco");
    // A do-not-invent constraint must be present in the system prompt.
    expect(seen.system.toLowerCase()).toContain("only");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/narrative.test.ts`
Expected: FAIL — `./narrative` has no `generateNarrative`.

- [ ] **Step 3: Write `app/lib/narrative.ts`**

```ts
import { HAIKU, type LlmClient } from "./anthropic";

export type StatFacts = {
  stat: string;
  gp: string;
  value: number | null;
  units: string | null;
  source: string;
};

const SYSTEM = [
  "You write a two-sentence explanation for a single Formula 1 stat lookup.",
  "You may use ONLY the facts in the JSON the user provides.",
  "Do not invent or estimate any numbers, drivers, teams, causes, or comparisons not present in that JSON.",
  "State the value and circuit plainly; the second sentence may add brief, general context that does not introduce new facts.",
].join(" ");

export async function generateNarrative(client: LlmClient, facts: StatFacts): Promise<string> {
  const msg = await client.messages.create({
    model: HAIKU,
    max_tokens: 200,
    system: SYSTEM,
    messages: [{ role: "user", content: JSON.stringify(facts) }],
  });
  return msg.content
    .filter((b: any) => b.type === "text")
    .map((b: any) => b.text)
    .join("")
    .trim();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/narrative.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/lib/narrative.ts app/lib/narrative.test.ts
git commit -m "feat: add grounded narrative generator with do-not-invent constraint"
```

---

## Task 7: Orchestration (deps-injected)

**Files:** Create `app/lib/orchestrate.ts`, `app/lib/orchestrate.test.ts`

`answerQuery` is pure over injected deps so it is fully testable without network or keys. The route (Task 8) supplies real deps.

- [ ] **Step 1: Write the failing test**

Create `app/lib/orchestrate.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { answerQuery, type AnswerDeps } from "./orchestrate";

const FACTS = { stat: "pit_loss", gp: "Monaco", value: 19.5, units: "s", source: "curated track features" };

function deps(over: Partial<AnswerDeps> = {}): AnswerDeps {
  return {
    parse: async () => ({ intent: "lookup_stat", stat: "pit_loss", gp: "Monaco" }),
    lookup: async () => FACTS,
    narrate: async () => "Monaco loses about 19.5s.",
    ...over,
  };
}

describe("answerQuery", () => {
  it("returns a supported answer for a pit_loss lookup", async () => {
    const out = await answerQuery(deps(), "pit lane Monaco?");
    expect(out).toEqual({ supported: true, facts: FACTS, narrative: "Monaco loses about 19.5s." });
  });

  it("returns an honest unsupported message for other intents", async () => {
    const out = await answerQuery(deps({ parse: async () => ({ intent: "predict_pace" }) }), "who wins?");
    expect(out.supported).toBe(false);
    expect(out.message).toMatch(/pit-lane/i);
  });

  it("does not call lookup or narrate when unsupported", async () => {
    let called = false;
    const out = await answerQuery(
      deps({
        parse: async () => ({ intent: "explain_concept" }),
        lookup: async () => {
          called = true;
          return FACTS;
        },
      }),
      "what is deg?",
    );
    expect(out.supported).toBe(false);
    expect(called).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/orchestrate.test.ts`
Expected: FAIL — `./orchestrate` missing.

- [ ] **Step 3: Write `app/lib/orchestrate.ts`**

```ts
import type { ParsedQuery } from "./parser";
import type { StatFacts } from "./narrative";

export type AnswerDeps = {
  parse: (query: string) => Promise<ParsedQuery>;
  lookup: (stat: string, gp: string) => Promise<StatFacts>;
  narrate: (facts: StatFacts) => Promise<string>;
};

export type Answer =
  | { supported: true; facts: StatFacts; narrative: string }
  | { supported: false; message: string };

const UNSUPPORTED =
  "This early slice only answers pit-lane time-loss lookups — e.g. “How much time is lost in the pit lane at Monaco?”";

export async function answerQuery(deps: AnswerDeps, query: string): Promise<Answer> {
  const parsed = await deps.parse(query);
  if (parsed.intent !== "lookup_stat" || parsed.stat !== "pit_loss" || !parsed.gp) {
    return { supported: false, message: UNSUPPORTED };
  }
  const facts = await deps.lookup(parsed.stat, parsed.gp);
  const narrative = await deps.narrate(facts);
  return { supported: true, facts, narrative };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/orchestrate.test.ts`
Expected: PASS (all three).

- [ ] **Step 5: Commit**

```bash
git add app/lib/orchestrate.ts app/lib/orchestrate.test.ts
git commit -m "feat: add query orchestration over injected parse/lookup/narrate deps"
```

---

## Task 8: The `/api/ask` route (wiring)

**Files:** Create `app/api/ask/route.ts`

Wires real deps into `answerQuery`: parse + narrate via the Anthropic client, lookup via a server-side fetch to the Python function on the same origin (derived from the request URL so it works under `vercel dev`). Missing-key errors are caught and surfaced.

- [ ] **Step 1: Write `app/api/ask/route.ts`**

```ts
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
```

- [ ] **Step 2: Verify the app still builds**

Run: `npm run build`
Expected: compiles, with `/api/ask` listed as a route. (End-to-end behavior is verified in Task 11.)

- [ ] **Step 3: Commit**

```bash
git add app/api/ask/route.ts
git commit -m "feat: add /api/ask orchestration route wiring parser, lookup, narrative"
```

---

## Task 9: Reveal component (shaders.com Ascii/Dither + fallback)

**Files:** Create `app/lib/reveal-fallback.ts`, `app/lib/reveal-fallback.test.ts`, `app/components/Reveal.tsx`

The fallback decision is a pure, tested function. The shader integration is an external-API step: the exact `shaders` Ascii/Dither component names and props (and the `disableTelemetry` flag) must be confirmed against the installed package's types/README before wiring — do not guess prop names.

- [ ] **Step 1: Write the failing fallback test**

Create `app/lib/reveal-fallback.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { shouldUseFallback } from "./reveal-fallback";

describe("shouldUseFallback", () => {
  it("falls back when prefers-reduced-motion matches", () => {
    expect(shouldUseFallback({ prefersReducedMotion: true, hasWebGPU: true })).toBe(true);
  });
  it("falls back when WebGPU is unavailable", () => {
    expect(shouldUseFallback({ prefersReducedMotion: false, hasWebGPU: false })).toBe(true);
  });
  it("uses the shader when motion is allowed and WebGPU is present", () => {
    expect(shouldUseFallback({ prefersReducedMotion: false, hasWebGPU: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/lib/reveal-fallback.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write `app/lib/reveal-fallback.ts`**

```ts
export type RevealEnv = { prefersReducedMotion: boolean; hasWebGPU: boolean };

/** Use the plain fade fallback when motion is reduced OR WebGPU is unavailable. */
export function shouldUseFallback({ prefersReducedMotion, hasWebGPU }: RevealEnv): boolean {
  return prefersReducedMotion || !hasWebGPU;
}

/** Read the current environment in the browser (guarded for SSR). */
export function readRevealEnv(): RevealEnv {
  if (typeof window === "undefined") return { prefersReducedMotion: true, hasWebGPU: false };
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const hasWebGPU = typeof (navigator as any).gpu !== "undefined";
  return { prefersReducedMotion, hasWebGPU };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/lib/reveal-fallback.test.ts`
Expected: PASS.

- [ ] **Step 5: Confirm the `shaders` API, then write `app/components/Reveal.tsx`**

First inspect the installed package to confirm the real component/props:
```bash
cat node_modules/shaders/package.json | grep -E '"(main|module|types|exports)"'
ls node_modules/shaders/dist 2>/dev/null || ls node_modules/shaders
# open the type declarations to find the Ascii/Dither component names, props, and the telemetry flag
```

Then create `app/components/Reveal.tsx`. Wrap children in the Ascii/Dither resolve when `shouldUseFallback` is false; otherwise render a GSAP fade. Set the telemetry-disable flag and include the required "Powered by Shaders" attribution. Use the **confirmed** import/prop names from the step above in place of the names marked `/* CONFIRM */`:

```tsx
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import gsap from "gsap";
import { readRevealEnv, shouldUseFallback } from "@/app/lib/reveal-fallback";
// CONFIRM these exports against node_modules/shaders types before relying on them:
import { Shader, Ascii } from "shaders";

/**
 * System-wide reveal wrapper (PRD §6.7), applied to the answer card in M2.
 * Resolves children from noise into clarity via the shaders.com Ascii pass;
 * falls back to a plain GSAP fade for reduced-motion or no-WebGPU.
 * "Powered by Shaders" attribution is required by the package license (§7.1).
 */
export function Reveal({ children, active }: { children: ReactNode; active: boolean }) {
  const [fallback, setFallback] = useState(true); // SSR-safe default
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setFallback(shouldUseFallback(readRevealEnv()));
  }, []);

  useEffect(() => {
    if (fallback && active && ref.current) {
      gsap.fromTo(ref.current, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" });
    }
  }, [fallback, active]);

  if (!active) return null;

  if (fallback) {
    return (
      <div ref={ref}>
        {children}
        <ShadersAttribution />
      </div>
    );
  }

  return (
    <div>
      {/* CONFIRM: disableTelemetry flag + Ascii prop names against the package types */}
      <Shader disableTelemetry>
        <Ascii>{children}</Ascii>
      </Shader>
      <ShadersAttribution />
    </div>
  );
}

function ShadersAttribution() {
  return (
    <a
      href="https://shaders.com"
      className="mt-2 block text-[10px] uppercase tracking-widest text-zinc-600"
      rel="noopener noreferrer"
      target="_blank"
    >
      Powered by Shaders
    </a>
  );
}
```

- [ ] **Step 6: Verify the build compiles with the confirmed API**

Run: `npm run build`
Expected: compiles. If the `shaders` import/props differ from the placeholders, fix them per the types confirmed in Step 5 until the build passes.

- [ ] **Step 7: Commit**

```bash
git add app/lib/reveal-fallback.ts app/lib/reveal-fallback.test.ts app/components/Reveal.tsx
git commit -m "feat: add Reveal component with Ascii resolve and reduced-motion fallback"
```

---

## Task 10: Search UI page

**Files:** Modify `app/page.tsx`

Replace the placeholder with a client component: one input, POST to `/api/ask`, render the answer (or honest unsupported/error message) inside `<Reveal>`. The reveal plays concurrent with the request (it mounts as soon as `loading` starts), doubling as the loading state.

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Verify the build**

Run: `npm run build`
Expected: compiles cleanly.

- [ ] **Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add search UI rendering the answer through the Reveal"
```

---

## Task 11: `vercel.json` + manual end-to-end verification

**Files:** Create `vercel.json`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "functions": {
    "api/inference.py": {
      "includeFiles": "src/**"
    }
  }
}
```

- [ ] **Step 2: Run the full automated suite**

Run:
```bash
python -m pytest -q
npx vitest run
```
Expected: all Python tests pass (M1 suite + the two new Python tests); all Vitest tests pass.

- [ ] **Step 3: Manual end-to-end verification (the M2 gate)**

```bash
# one-time: install the Vercel CLI if absent
npm i -g vercel   # or: npx vercel dev

# provide a real key for this run (do NOT commit it; .env.local is gitignored)
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env.local

npx vercel dev
```
Then open the local URL, submit "How much time is lost in the pit lane at Monaco?", and confirm:
- The answer card shows **19.5 s** with a grounded two-sentence narrative.
- The ASCII/dither reveal plays (or the plain fade, under reduced-motion / no-WebGPU).
- An off-slice query (e.g. "who wins Sunday?") returns the honest "only pit-lane time-loss" message.

Record the result. If `vercel dev` cannot install the heavy `requirements.txt` quickly, note it — slimming the function's Python deps is a tracked follow-up, not an M2 blocker.

- [ ] **Step 4: Commit**

```bash
git add vercel.json
git commit -m "chore: add vercel.json shipping src with the Python inference function"
```

---

## Task 12: Update handoff

**Files:** Modify `handoff.md`

- [ ] **Step 1: Update the status block and next-steps**

In `handoff.md`, update the top status line to note **M2 in progress/complete** (per where execution lands), and under §4 record:
- M2 thin slice built and verified locally (Monaco pit-loss, NL→parser→Python→narrative→reveal).
- **Deferred follow-ups (tracked):** the actual **Vercel deploy** (the one piece of the literal M2 DoD moved out); slimming the Python function's `requirements.txt` (lookup needs only pandas/pyarrow, not fastf1/sklearn/matplotlib); confirming the `shaders` Ascii/Dither prop names against the package types if not already done.
- Next build task: **M3 — calibrated podium probabilities**.

- [ ] **Step 2: Commit**

```bash
git add handoff.md
git commit -m "docs: record M2 thin-slice completion and deferred follow-ups"
```

---

## Self-Review

**Spec coverage:**
- §2 anchor query (Monaco pit_loss) → Tasks 1, 2, 10, 11. ✓
- §2 local-only / deploy deferred → Task 11 (vercel dev) + Task 12 (deferred follow-up). ✓
- §3 flow (NL→parser→Python→narrative→reveal) → Tasks 5, 8, 2, 6, 9, 10. ✓
- §4 monorepo layout → Tasks 2, 3, 8 (routing collision avoided: Python at `api/inference`, Next at `app/api/ask`). ✓
- §5 two Haiku calls (tool-use parser; grounded narrative) → Tasks 5, 6. ✓
- §6 Python endpoint fastf1-free → Task 2 (imports `src.inference.lookup` directly; no-fastf1 test run). ✓
- §7 Reveal (shaders + GSAP + reduced-motion/no-WebGPU fallback + disableTelemetry + attribution) → Task 9. ✓
- §8 curated Monaco entry → Task 1. ✓
- §9 error/scope guards (missing key surfaced; off-slice message; dev runs without key via injected fakes) → Tasks 4, 7, 8. ✓
- §10 tests (Python track + handler; TS parser-contract + narrative-grounding) → Tasks 1, 2, 5, 6, 7, 9. ✓
- §11 done-when (local vercel dev, real Haiku, tests green) → Task 11. ✓

**Placeholder scan:** The only deliberately deferred specifics are the external `shaders` Ascii/Dither prop names — handled as an explicit confirm-against-types step in Task 9 (Step 5), not a silent TODO. No other placeholders.

**Type consistency:** `ParsedQuery`/`Intent` (parser.ts) and `StatFacts` (narrative.ts) are imported by `orchestrate.ts` and `route.ts`; the Python `lookup_stat` dict shape (`stat/gp/value/units/source`) matches `StatFacts` and the page's render. `shouldUseFallback`/`readRevealEnv`/`RevealEnv` names match across reveal-fallback.ts and Reveal.tsx.
