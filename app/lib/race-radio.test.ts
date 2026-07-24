import { describe, expect, it } from "vitest";
import { RADIO_MESSAGES, pickRadioMessage, radioSteps } from "@/app/lib/race-radio";

describe("RADIO_MESSAGES", () => {
  it("is non-empty", () => {
    expect(RADIO_MESSAGES.length).toBeGreaterThan(0);
  });

  it("has no duplicate lines", () => {
    expect(new Set(RADIO_MESSAGES).size).toBe(RADIO_MESSAGES.length);
  });
});

describe("pickRadioMessage", () => {
  it("returns a member of the list", () => {
    for (let i = 0; i < 50; i++) {
      expect(RADIO_MESSAGES).toContain(pickRadioMessage(null));
    }
  });

  it("never returns the previous message", () => {
    for (const prev of RADIO_MESSAGES) {
      for (let i = 0; i < 30; i++) {
        expect(pickRadioMessage(prev)).not.toBe(prev);
      }
    }
  });

  it("ignores a previous value that is not in the list", () => {
    expect(RADIO_MESSAGES).toContain(pickRadioMessage("not a real message"));
  });
});

describe("radioSteps", () => {
  it("returns one step per word", () => {
    expect(radioSteps("Final lap. Push! Push! Push!")).toHaveLength(5);
  });

  it("starts the first step at 0ms", () => {
    expect(radioSteps("Box, box.")[0]).toEqual({ text: "Box,", atMs: 0 });
  });

  it("builds each step from the words so far", () => {
    expect(radioSteps("We're on Plan B.").map((s) => s.text)).toEqual([
      "We're",
      "We're on",
      "We're on Plan",
      "We're on Plan B.",
    ]);
  });

  it("ends with the complete message for every real radio line", () => {
    for (const message of RADIO_MESSAGES) {
      const steps = radioSteps(message);
      expect(steps[steps.length - 1].text).toBe(message);
    }
  });

  it("advances time monotonically", () => {
    const steps = radioSteps("If you speak to me every lap, I will disconnect the radio.");
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i].atMs).toBeGreaterThan(steps[i - 1].atMs);
    }
  });

  it("holds longer after a word ending in punctuation", () => {
    // "Box," ends in a comma, so the gap before "box." is the base beat plus the pause.
    const punctuated = radioSteps("Box, box.");
    // "Box box" has no punctuation on the first word, so the gap is the base beat alone.
    const plain = radioSteps("Box box");
    expect(punctuated[1].atMs).toBeGreaterThan(plain[1].atMs);
  });

  it("returns no steps for empty or whitespace-only input", () => {
    expect(radioSteps("")).toEqual([]);
    expect(radioSteps("   ")).toEqual([]);
  });
});
