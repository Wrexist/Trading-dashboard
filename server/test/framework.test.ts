import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.ts";
import { EventStore } from "../src/eventStore.ts";
import { EventBus } from "../src/bus.ts";
import { RateBudget, Supervisor } from "../src/adapters/framework.ts";

function makeBus() {
  const db = openDb(":memory:");
  const store = new EventStore(db);
  return { store, bus: new EventBus(store) };
}

describe("RateBudget", () => {
  it("allows up to maxPerMinute, then refuses", () => {
    const budget = new RateBudget(3);
    const t = 1_000_000;
    expect(budget.take(t)).toBe(true);
    expect(budget.take(t + 1)).toBe(true);
    expect(budget.take(t + 2)).toBe(true);
    expect(budget.take(t + 3)).toBe(false);
  });

  it("frees slots after the sliding minute", () => {
    const budget = new RateBudget(1);
    const t = 1_000_000;
    expect(budget.take(t)).toBe(true);
    expect(budget.take(t + 59_000)).toBe(false);
    expect(budget.take(t + 60_001)).toBe(true);
  });
});

describe("Supervisor", () => {
  it("goes down after 3 consecutive failures and publishes AdapterUnhealthy", () => {
    const { bus, store } = makeBus();
    const sup = new Supervisor(bus, "coingecko", 10);
    sup.reportFailure("boom 1");
    sup.reportFailure("boom 2");
    expect(sup.state).not.toBe("down");
    sup.reportFailure("boom 3");
    expect(sup.state).toBe("down");
    const unhealthy = store.recent(10).filter((e) => e.type === "AdapterUnhealthy");
    expect(unhealthy).toHaveLength(1);
    expect(unhealthy[0]).toMatchObject({ source: "coingecko", failureCount: 3 });
  });

  it("publishes AdapterRecovered on success after down", () => {
    const { bus, store } = makeBus();
    const sup = new Supervisor(bus, "finnhub", 10);
    sup.markDown("missing key");
    sup.reportSuccess("back");
    expect(sup.state).toBe("ok");
    const recovered = store.recent(10).filter((e) => e.type === "AdapterRecovered");
    expect(recovered).toHaveLength(1);
    expect(recovered[0]).toMatchObject({ source: "finnhub" });
  });

  it("opens the circuit with backoff after failures", () => {
    const { bus } = makeBus();
    const sup = new Supervisor(bus, "alpaca", 10);
    expect(sup.canAttempt()).toBe(true);
    sup.reportFailure("boom");
    expect(sup.canAttempt()).toBe(false); // 5s backoff just started
    expect(sup.canAttempt(Date.now() + 6_000)).toBe(true);
  });

  it("health() reports everything the Health view needs", () => {
    const { bus } = makeBus();
    const sup = new Supervisor(bus, "alpaca", 10);
    sup.markDown("missing env ALPACA_KEY_ID");
    const h = sup.health();
    expect(h).toMatchObject({
      source: "alpaca",
      state: "down",
      detail: "missing env ALPACA_KEY_ID",
      lastOkAt: null,
    });
    expect(h.budget.maxPerMinute).toBe(10);
  });
});
