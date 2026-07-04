/**
 * Append-only persistence of the event stream (§2.0, §2.2). Every published
 * event lands here before any subscriber sees it, so the stream on disk is
 * always a superset of what any module reacted to — replayable (§2.7).
 */

import type { SentinelEvent } from "@sentinel/shared/events";
import type { Db } from "./db.ts";

export class EventStore {
  #insert;
  #recent;
  #count;

  constructor(db: Db) {
    this.#insert = db.prepare(
      "INSERT INTO events (event_id, type, emitted_at, catalog_version, payload) VALUES (?, ?, ?, ?, ?)",
    );
    this.#recent = db.prepare(
      "SELECT payload FROM events ORDER BY seq DESC LIMIT ?",
    );
    this.#count = db.prepare("SELECT COUNT(*) AS n FROM events");
  }

  append(event: SentinelEvent): void {
    this.#insert.run(
      event.eventId,
      event.type,
      event.emittedAt,
      event.catalogVersion,
      JSON.stringify(event),
    );
  }

  /** Most recent events, newest first. */
  recent(limit: number): SentinelEvent[] {
    const rows = this.#recent.all(limit) as Array<{ payload: string }>;
    return rows.map((r) => JSON.parse(r.payload) as SentinelEvent);
  }

  count(): number {
    return Number((this.#count.get() as { n: number }).n);
  }
}
