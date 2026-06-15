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
