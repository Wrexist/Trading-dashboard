import { describe, expect, it } from "vitest";
import { openDb } from "../src/db.ts";
import { EventStore } from "../src/eventStore.ts";
import { EventBus, type EventInput } from "../src/bus.ts";

function makeBus() {
  const db = openDb(":memory:");
  const store = new EventStore(db);
  return { db, store, bus: new EventBus(store) };
}

const regimeChange: EventInput = {
  type: "RegimeChanged",
  assetClass: "stocks",
  from: "NEUTRAL",
  to: "RISK_OFF",
  evidence: ["test"],
};

describe("EventBus", () => {
  it("stamps the envelope and returns the full event", () => {
    const { bus } = makeBus();
    const event = bus.publish(regimeChange);
    expect(event.eventId).toMatch(/[0-9a-f-]{36}/);
    expect(event.emittedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(event.catalogVersion).toBe(1);
  });

  it("persists before dispatching, so subscribers see stored events", () => {
    const { bus, store } = makeBus();
    let countSeenInsideHandler = -1;
    bus.subscribe("RegimeChanged", () => {
      countSeenInsideHandler = store.count();
    });
    bus.publish(regimeChange);
    expect(countSeenInsideHandler).toBe(1);
  });

  it("dispatches to type subscribers and subscribeAll", () => {
    const { bus } = makeBus();
    const seen: string[] = [];
    bus.subscribe("RegimeChanged", (e) => seen.push(`typed:${e.to}`));
    bus.subscribeAll((e) => seen.push(`all:${e.type}`));
    bus.publish(regimeChange);
    expect(seen).toEqual(["typed:RISK_OFF", "all:RegimeChanged"]);
  });

  it("a throwing subscriber does not block others and is reported", () => {
    const { bus } = makeBus();
    const reported: unknown[] = [];
    bus.onSubscriberError = (err) => reported.push(err);
    const seen: string[] = [];
    bus.subscribe("RegimeChanged", () => {
      throw new Error("boom");
    });
    bus.subscribe("RegimeChanged", () => seen.push("second handler ran"));
    bus.publish(regimeChange);
    expect(seen).toEqual(["second handler ran"]);
    expect(reported).toHaveLength(1);
  });

  it("unsubscribe stops delivery", () => {
    const { bus } = makeBus();
    let calls = 0;
    const off = bus.subscribe("RegimeChanged", () => calls++);
    bus.publish(regimeChange);
    off();
    bus.publish(regimeChange);
    expect(calls).toBe(1);
  });
});

describe("EventStore / append-only schema", () => {
  it("recent() returns newest first", () => {
    const { bus, store } = makeBus();
    bus.publish(regimeChange);
    bus.publish({ ...regimeChange, to: "RISK_ON" });
    const recent = store.recent(10);
    expect(recent).toHaveLength(2);
    expect(recent[0]).toMatchObject({ type: "RegimeChanged", to: "RISK_ON" });
  });

  it("UPDATE on events is rejected by the schema itself", () => {
    const { bus, db } = makeBus();
    bus.publish(regimeChange);
    expect(() => db.exec("UPDATE events SET type = 'Tampered'")).toThrow(
      /append-only/,
    );
  });

  it("DELETE on events is rejected by the schema itself", () => {
    const { bus, db } = makeBus();
    bus.publish(regimeChange);
    expect(() => db.exec("DELETE FROM events")).toThrow(/append-only/);
  });
});
