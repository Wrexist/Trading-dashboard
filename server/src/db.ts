/**
 * SQLite storage (§2.2). Uses node:sqlite — synchronous, zero native deps,
 * fine for v1 (SQLite→Postgres migration is a later concern by design).
 *
 * The event stream is APPEND-ONLY and that is enforced in the schema itself:
 * UPDATE/DELETE on `events` abort via triggers, so no code path — present or
 * future — can silently rewrite history.
 */

import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type Db = DatabaseSync;

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

CREATE TABLE IF NOT EXISTS events (
  seq             INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id        TEXT NOT NULL UNIQUE,
  type            TEXT NOT NULL,
  emitted_at      TEXT NOT NULL,
  catalog_version INTEGER NOT NULL,
  payload         TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type, seq);

CREATE TRIGGER IF NOT EXISTS events_append_only_update
BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT, 'events is append-only'); END;

CREATE TRIGGER IF NOT EXISTS events_append_only_delete
BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT, 'events is append-only'); END;

CREATE TABLE IF NOT EXISTS bars (
  symbol       TEXT NOT NULL,
  timeframe    TEXT NOT NULL,
  closed_at    TEXT NOT NULL,
  open         REAL NOT NULL,
  high         REAL NOT NULL,
  low          REAL NOT NULL,
  close        REAL NOT NULL,
  volume       REAL NOT NULL,
  source       TEXT NOT NULL,
  fetched_at   TEXT NOT NULL,
  staleness_ms INTEGER NOT NULL,
  PRIMARY KEY (symbol, timeframe, closed_at)
);

CREATE TABLE IF NOT EXISTS news (
  canonical_id TEXT PRIMARY KEY,
  headline     TEXT NOT NULL,
  url          TEXT NOT NULL,
  symbols      TEXT NOT NULL,
  published_at TEXT NOT NULL,
  source       TEXT NOT NULL,
  fetched_at   TEXT NOT NULL
);
`;

export function openDb(path: string): Db {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

/** §2.2 bar retention: 1m×30d, 5m×180d (daily×10y needs no pruning yet). */
export function pruneBars(db: Db, now: Date = new Date()): number {
  const cutoff = (days: number) =>
    new Date(now.getTime() - days * 86_400_000).toISOString();
  const r1 = db
    .prepare("DELETE FROM bars WHERE timeframe = '1m' AND closed_at < ?")
    .run(cutoff(30));
  const r5 = db
    .prepare("DELETE FROM bars WHERE timeframe = '5m' AND closed_at < ?")
    .run(cutoff(180));
  return Number(r1.changes) + Number(r5.changes);
}
