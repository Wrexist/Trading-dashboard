/**
 * In-process typed event bus (§2.0) — simple pub/sub over the discriminated
 * union in shared/events.ts. Modules collaborate ONLY through this.
 *
 * Guarantees:
 * - Persist-then-dispatch: an event is appended to the append-only store
 *   before any subscriber runs, so the on-disk stream never misses an event
 *   a module reacted to.
 * - No silent failures: a throwing subscriber is reported (console + the
 *   onSubscriberError hook, wired to Sentry at boot) and never swallows the
 *   event for other subscribers.
 */

import { randomUUID } from "node:crypto";
import {
  EVENT_CATALOG_VERSION,
  type SentinelEvent,
  type SentinelEventType,
} from "@sentinel/shared/events";
import type { EventStore } from "./eventStore.ts";

/** What callers provide: the event minus the envelope the bus stamps on. */
export type EventInput = {
  [T in SentinelEvent as T["type"]]: Omit<
    T,
    "eventId" | "emittedAt" | "catalogVersion"
  >;
}[SentinelEventType];

type EventOf<T extends SentinelEventType> = Extract<SentinelEvent, { type: T }>;
type Handler<T extends SentinelEventType> = (event: EventOf<T>) => void;
type AnyHandler = (event: SentinelEvent) => void;

export class EventBus {
  #store: EventStore;
  #byType = new Map<SentinelEventType, Set<AnyHandler>>();
  #all = new Set<AnyHandler>();
  onSubscriberError: (err: unknown, event: SentinelEvent) => void = () => {};

  constructor(store: EventStore) {
    this.#store = store;
  }

  publish(input: EventInput): SentinelEvent {
    const event = {
      ...input,
      eventId: randomUUID(),
      emittedAt: new Date().toISOString(),
      catalogVersion: EVENT_CATALOG_VERSION,
    } as SentinelEvent;

    this.#store.append(event);

    const handlers = [
      ...(this.#byType.get(event.type) ?? []),
      ...this.#all,
    ];
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[bus] subscriber failed on ${event.type}:`, err);
        this.onSubscriberError(err, event);
      }
    }
    return event;
  }

  subscribe<T extends SentinelEventType>(type: T, handler: Handler<T>): () => void {
    let set = this.#byType.get(type);
    if (!set) {
      set = new Set();
      this.#byType.set(type, set);
    }
    set.add(handler as AnyHandler);
    return () => set.delete(handler as AnyHandler);
  }

  subscribeAll(handler: AnyHandler): () => void {
    this.#all.add(handler);
    return () => this.#all.delete(handler);
  }
}
