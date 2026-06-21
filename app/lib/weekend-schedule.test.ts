import { describe, it, expect } from "vitest";
import { dueCheckpoint, type SessionSchedule } from "./weekend-schedule";

const sched: SessionSchedule = {
  year: 2026,
  gp: "Austria",
  preQuali: "2026-06-26T16:00:00Z",
  postQuali: "2026-06-27T15:00:00Z",
  final: "2026-06-28T15:00:00Z",
};

describe("dueCheckpoint", () => {
  it("returns null before any checkpoint", () => {
    expect(dueCheckpoint(new Date("2026-06-26T10:00:00Z"), sched)).toBeNull();
  });
  it("returns pre-quali after FP, before quali", () => {
    expect(dueCheckpoint(new Date("2026-06-26T17:00:00Z"), sched)).toBe("pre-quali");
  });
  it("returns post-quali after qualifying", () => {
    expect(dueCheckpoint(new Date("2026-06-27T18:00:00Z"), sched)).toBe("post-quali");
  });
  it("returns final after the race", () => {
    expect(dueCheckpoint(new Date("2026-06-28T18:00:00Z"), sched)).toBe("final");
  });
});
