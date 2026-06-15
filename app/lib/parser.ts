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
