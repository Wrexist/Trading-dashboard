import { describe, expect, it } from "vitest";
import { isBadTick, RollingWindow } from "../src/validation/badTick.ts";
import { canonicalNewsId, normalizeHeadline } from "../src/validation/newsDedup.ts";

describe("isBadTick", () => {
  const steady = [100, 100.2, 99.8, 100.1, 100.3, 99.9, 100.0, 100.2, 99.7, 100.1];

  it("accepts values near the rolling median", () => {
    expect(isBadTick(100.4, steady)).toBe(false);
  });

  it("rejects a wildly deviant tick", () => {
    expect(isBadTick(1000, steady)).toBe(true);
    expect(isBadTick(1, steady)).toBe(true);
  });

  it("rejects non-finite and non-positive prices outright", () => {
    expect(isBadTick(NaN, steady)).toBe(true);
    expect(isBadTick(0, steady)).toBe(true);
    expect(isBadTick(-5, steady)).toBe(true);
  });

  it("does not judge with insufficient samples", () => {
    expect(isBadTick(1000, [100, 100, 100])).toBe(false);
  });

  it("survives a flat window (MAD=0) with a relative bound", () => {
    const flat = Array(20).fill(50);
    expect(isBadTick(50.5, flat)).toBe(false);
    expect(isBadTick(80, flat)).toBe(true);
  });

  it("a burst of bad ticks cannot drag the yardstick (robustness)", () => {
    const withOutliers = [...steady, 500, 510];
    expect(isBadTick(505, withOutliers)).toBe(true);
  });
});

describe("RollingWindow", () => {
  it("evicts oldest beyond capacity", () => {
    const w = new RollingWindow(3);
    [1, 2, 3, 4].forEach((v) => w.push(v));
    expect([...w.values]).toEqual([2, 3, 4]);
  });
});

describe("news dedup", () => {
  it("normalizes case, punctuation, whitespace", () => {
    expect(normalizeHeadline("  Fed HIKES rates!!  ")).toBe("fed hikes rates");
  });

  it("same story with tracking params → same canonical id", () => {
    const a = canonicalNewsId({
      headline: "Fed hikes rates",
      url: "https://news.example.com/fed?utm_source=x",
    });
    const b = canonicalNewsId({
      headline: "Fed Hikes Rates!",
      url: "https://news.example.com/fed",
    });
    expect(a).toBe(b);
  });

  it("different stories → different ids", () => {
    const a = canonicalNewsId({ headline: "Fed hikes rates", url: "https://a.com/1" });
    const b = canonicalNewsId({ headline: "Fed cuts rates", url: "https://a.com/1" });
    expect(a).not.toBe(b);
  });
});
