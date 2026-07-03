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
          "predict_podium for who-will-finish-on-the-podium / top-3 / who-will-win. " +
          "predict_pace for long-run / race-pace gap questions (who is fastest over a stint). " +
          "predict_strategy for how-many-pit-stops / one-stop-or-two questions. " +
          "predict_compound: which tyre compound is typically dominant at a circuit (historical). " +
          "lookup_stat for a single computed circuit stat. explain_concept for 'what is …' questions.",
      },
      stat: {
        type: "string",
        enum: ["pit_loss", "tyre_deg", "stint_length"],
        description:
          "For lookup_stat only: pit_loss (pit-lane time loss), tyre_deg (how fast tyres wear), " +
          "or stint_length (how many laps a stint lasts).",
      },
      gp: {
        type: "string",
        description:
          "Grand Prix / circuit. Prefer the country or city name, e.g. Italy, Mexico City, Las Vegas, Saudi Arabia. " +
          "If the question refers to the upcoming race without naming a circuit (e.g. 'the next race', 'this weekend', 'the upcoming GP'), output the literal value 'next race'.",
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
