import { describe, expect, it } from "vitest";
import { sessionState } from "../src/marketHours.ts";

// All inputs are UTC instants; expectations are New York sessions.
// July = EDT (UTC-4), so 13:30 UTC = 09:30 New York.
describe("sessionState", () => {
  it("crypto is always open", () => {
    expect(sessionState("CRYPTO", new Date("2026-07-04T03:00:00Z"))).toBe("open24h");
  });

  it("regular session opens 09:30 New York (EDT)", () => {
    expect(sessionState("NYSE", new Date("2026-07-06T13:29:00Z"))).toBe("premarket");
    expect(sessionState("NYSE", new Date("2026-07-06T13:30:00Z"))).toBe("regular");
  });

  it("regular session ends 16:00 New York, afterhours until 20:00", () => {
    expect(sessionState("NYSE", new Date("2026-07-06T19:59:00Z"))).toBe("regular");
    expect(sessionState("NYSE", new Date("2026-07-06T20:00:00Z"))).toBe("afterhours");
    expect(sessionState("NYSE", new Date("2026-07-07T00:00:00Z"))).toBe("closed");
  });

  it("premarket starts 04:00 New York", () => {
    expect(sessionState("NYSE", new Date("2026-07-06T07:59:00Z"))).toBe("closed");
    expect(sessionState("NYSE", new Date("2026-07-06T08:00:00Z"))).toBe("premarket");
  });

  it("weekends are closed even at midday", () => {
    // 2026-07-04 is a Saturday.
    expect(sessionState("NYSE", new Date("2026-07-04T15:00:00Z"))).toBe("closed");
    expect(sessionState("NYSE", new Date("2026-07-05T15:00:00Z"))).toBe("closed");
  });

  it("holidays are closed (Independence Day observed Fri 2026-07-03)", () => {
    expect(sessionState("NYSE", new Date("2026-07-03T15:00:00Z"))).toBe("closed");
  });

  it("handles EST (winter, UTC-5): 14:30 UTC = 09:30 New York", () => {
    // 2026-01-14 is a Wednesday.
    expect(sessionState("NYSE", new Date("2026-01-14T14:29:00Z"))).toBe("premarket");
    expect(sessionState("NYSE", new Date("2026-01-14T14:30:00Z"))).toBe("regular");
  });
});
