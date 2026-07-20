import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { NAV_LINKS, isActiveLink, emitAskResetIfOnAsk, ASK_RESET_EVENT } from "./SiteNav";

describe("NAV_LINKS", () => {
  it("is the four nav links in order", () => {
    expect(NAV_LINKS.map((l) => l.href)).toEqual(["/ask", "/learn", "/accuracy", "/weekend"]);
    expect(NAV_LINKS.map((l) => l.label)).toEqual([
      "Ask",
      "Learn",
      "Accuracy",
      "Upcoming weekend",
    ]);
  });
});

describe("isActiveLink", () => {
  it("matches the root href only on exact '/'", () => {
    expect(isActiveLink("/", "/")).toBe(true);
    expect(isActiveLink("/ask", "/")).toBe(false);
  });
  it("matches /ask only on exact '/ask'", () => {
    expect(isActiveLink("/ask", "/ask")).toBe(true);
    expect(isActiveLink("/", "/ask")).toBe(false);
  });
  it("matches non-root hrefs by prefix", () => {
    expect(isActiveLink("/learn", "/learn")).toBe(true);
    expect(isActiveLink("/learn/drs", "/learn")).toBe(true);
    expect(isActiveLink("/weekend", "/weekend")).toBe(true);
    expect(isActiveLink("/", "/learn")).toBe(false);
  });
});

describe("emitAskResetIfOnAsk", () => {
  // This suite runs under vitest's "node" environment (no DOM), so `window` isn't a
  // global here — stub a minimal EventTarget in its place just for these assertions.
  beforeEach(() => {
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("emits the reset event only when already on /ask", () => {
    const listener = vi.fn();
    window.addEventListener(ASK_RESET_EVENT, listener);
    emitAskResetIfOnAsk("/ask", "/ask");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not emit when on a different route or navigating elsewhere", () => {
    const listener = vi.fn();
    window.addEventListener(ASK_RESET_EVENT, listener);
    emitAskResetIfOnAsk("/learn", "/ask");
    emitAskResetIfOnAsk("/ask", "/learn");
    expect(listener).not.toHaveBeenCalled();
  });
});
