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

  it("extracts a podium intent with gp + year", async () => {
    const client = fakeClient({ intent: "predict_podium", gp: "Monza", year: 2024 });
    const out = await parseQuery(client, "who's likely to podium at Monza in 2024?");
    expect(out).toEqual({ intent: "predict_podium", gp: "Monza", year: 2024 });
  });

  it("omits year when the parser doesn't return one", async () => {
    const client = fakeClient({ intent: "predict_podium", gp: "Italy" });
    const out = await parseQuery(client, "who podiums at Monza?");
    expect(out).toEqual({ intent: "predict_podium", gp: "Italy" });
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
