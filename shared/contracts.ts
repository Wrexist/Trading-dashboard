/**
 * API contracts between server and ui (ROADMAP §1.4 — collaboration only via
 * typed contracts). The ui renders exactly what the server reports; it never
 * computes health, risk, or staleness on its own.
 */

import type { SourceId } from "./events.ts";

/** Market session state (§2.1 market-hours module). */
export type SessionState =
  | "premarket"
  | "regular"
  | "afterhours"
  | "closed"
  | "open24h";

export type AdapterState = "starting" | "ok" | "down";

export interface AdapterHealth {
  source: SourceId;
  state: AdapterState;
  /** Human-readable status, e.g. "missing env ALPACA_KEY_ID" or "connected". */
  detail: string;
  /** UTC ISO-8601 of the last successful fetch/message, null if never. */
  lastOkAt: string | null;
  consecutiveFailures: number;
  /** Set while the circuit breaker is open (backoff in effect). */
  circuitOpenUntil: string | null;
  budget: {
    usedLastMinute: number;
    maxPerMinute: number;
  };
}

export interface HealthSnapshot {
  startedAt: string;
  now: string;
  session: {
    NYSE: SessionState;
    CRYPTO: SessionState;
  };
  adapters: AdapterHealth[];
  db: {
    sizeBytes: number;
    eventCount: number;
    barCount: number;
    newsCount: number;
  };
  sentryEnabled: boolean;
}
