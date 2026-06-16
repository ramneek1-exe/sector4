import { HAIKU, type LlmClient } from "./anthropic";

export type Intent =
  | "predict_pace"
  | "predict_strategy"
  | "predict_compound"
  | "predict_podium"
  | "lookup_stat"
  | "explain_concept";

export type ParsedQuery = { intent: Intent; stat?: string; gp?: string; year?: number };

export const ROUTE_TOOL = {
  name: "route_query",
  description: "Classify an F1 weekend question into an intent and extract entities.",
  input_schema: {
    type: "object" as const,
    properties: {
      intent: {
        type: "string",
        enum: [
          "predict_pace",
          "predict_strategy",
          "predict_compound",
          "predict_podium",
          "lookup_stat",
          "explain_concept",
        ],
        description:
          "Use predict_podium for who-will-finish-on-the-podium / top-3 / who-will-win questions.",
      },
      stat: {
        type: "string",
        enum: ["pit_loss", "tyre_deg", "stint_length"],
        description: "Only set for lookup_stat queries.",
      },
      gp: {
        type: "string",
        description:
          "Grand Prix / circuit. Prefer the country or city name, e.g. Italy, Mexico City, Las Vegas, Saudi Arabia.",
      },
      year: {
        type: "integer",
        description: "Season year if the question names one, e.g. 2024. Omit if not stated.",
      },
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
  const { intent, stat, gp, year } = block.input as ParsedQuery;
  return {
    intent,
    ...(stat ? { stat } : {}),
    ...(gp ? { gp } : {}),
    ...(typeof year === "number" ? { year } : {}),
  };
}
