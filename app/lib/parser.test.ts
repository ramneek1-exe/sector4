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
