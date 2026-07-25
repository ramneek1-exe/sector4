import { describe, expect, it } from "vitest";
import { buildStandings } from "@/app/lib/championship";
import { gapCellText, rateCellText } from "./ChampionshipTable";

describe("gapCellText", () => {
  it("reads an em dash for the leader", () => {
    expect(gapCellText(0)).toBe("—");
  });

  it("reads the negative deficit for a chaser", () => {
    expect(gapCellText(43)).toBe("-43");
  });
});

describe("rateCellText", () => {
  it("reads 'leader' for the row with no gap", () => {
    const [leader] = buildStandings({ VER: 241, PIA: 198 }, 13);
    expect(rateCellText(leader)).toBe("leader");
  });

  it("reads the out-scoring rate for a chaser", () => {
    const [, pia] = buildStandings({ VER: 241, PIA: 198 }, 13);
    expect(rateCellText(pia)).toBe("+3.3");
  });

  it("the season-over branch: gap first, so a finished season doesn't mislabel a chaser 'leader'", () => {
    // remainingRounds: 0 -> requiredRate is null for EVERY row, leader and chaser alike.
    // rateCellText must still branch on gap first so only the true leader reads "leader".
    const [ver, pia] = buildStandings({ VER: 241, PIA: 198 }, 0);
    expect(pia.gap).not.toBe(0);
    expect(pia.requiredRate).toBeNull();
    expect(rateCellText(pia)).toBe("—");
    expect(rateCellText(ver)).toBe("leader");
  });
});
