/**
 * Adapter framework (§2.1): every source runs under a Supervisor that owns
 * health state, a rate budget, and a circuit breaker with exponential
 * backoff. State transitions are published on the bus (AdapterUnhealthy /
 * AdapterRecovered) so the whole system — Health view, future confidence
 * demotion — sees failures the moment they happen. Nothing fails silently.
 */

import type { SourceId } from "@sentinel/shared/events";
import type { AdapterHealth, AdapterState } from "@sentinel/shared/contracts";
import type { EventBus } from "../bus.ts";

/** Sliding-window rate budget: at most maxPerMinute requests. */
export class RateBudget {
  #timestamps: number[] = [];
  readonly maxPerMinute: number;

  constructor(maxPerMinute: number) {
    this.maxPerMinute = maxPerMinute;
  }

  #evict(now: number): void {
    while (this.#timestamps.length > 0 && this.#timestamps[0]! <= now - 60_000) {
      this.#timestamps.shift();
    }
  }

  /** Consume one request slot; false = budget exhausted, do not call out. */
  take(now: number = Date.now()): boolean {
    this.#evict(now);
    if (this.#timestamps.length >= this.maxPerMinute) return false;
    this.#timestamps.push(now);
    return true;
  }

  usedLastMinute(now: number = Date.now()): number {
    this.#evict(now);
    return this.#timestamps.length;
  }
}

const FAILURES_TO_OPEN = 3;
const BACKOFF_BASE_MS = 5_000;
const BACKOFF_MAX_MS = 10 * 60_000;

export class Supervisor {
  readonly source: SourceId;
  readonly budget: RateBudget;
  #bus: EventBus;
  #state: AdapterState = "starting";
  #detail = "starting";
  #lastOkAt: string | null = null;
  #consecutiveFailures = 0;
  #circuitOpenUntil: number | null = null;
  #downSince: number | null = null;

  constructor(bus: EventBus, source: SourceId, maxPerMinute: number) {
    this.#bus = bus;
    this.source = source;
    this.budget = new RateBudget(maxPerMinute);
  }

  get state(): AdapterState {
    return this.#state;
  }

  /** Circuit check: false while backing off after repeated failures. */
  canAttempt(now: number = Date.now()): boolean {
    return this.#circuitOpenUntil === null || now >= this.#circuitOpenUntil;
  }

  reportSuccess(detail: string): void {
    const wasDown = this.#state === "down";
    this.#lastOkAt = new Date().toISOString();
    this.#consecutiveFailures = 0;
    this.#circuitOpenUntil = null;
    this.#state = "ok";
    this.#detail = detail;
    if (wasDown) {
      const downForMs = this.#downSince === null ? 0 : Date.now() - this.#downSince;
      this.#downSince = null;
      this.#bus.publish({ type: "AdapterRecovered", source: this.source, downForMs });
    }
  }

  reportFailure(reason: string): void {
    this.#consecutiveFailures++;
    this.#detail = reason;
    const backoff = Math.min(
      BACKOFF_BASE_MS * 2 ** Math.min(this.#consecutiveFailures - 1, 10),
      BACKOFF_MAX_MS,
    );
    this.#circuitOpenUntil = Date.now() + backoff;
    if (this.#consecutiveFailures >= FAILURES_TO_OPEN && this.#state !== "down") {
      this.#markDownAndPublish(reason);
    }
  }

  /** Immediate, deliberate down — e.g. required keys missing. Always visible. */
  markDown(reason: string): void {
    this.#consecutiveFailures++;
    this.#markDownAndPublish(reason);
  }

  #markDownAndPublish(reason: string): void {
    this.#state = "down";
    this.#detail = reason;
    this.#downSince ??= Date.now();
    this.#bus.publish({
      type: "AdapterUnhealthy",
      source: this.source,
      reason,
      failureCount: this.#consecutiveFailures,
    });
  }

  health(): AdapterHealth {
    return {
      source: this.source,
      state: this.#state,
      detail: this.#detail,
      lastOkAt: this.#lastOkAt,
      consecutiveFailures: this.#consecutiveFailures,
      circuitOpenUntil:
        this.#circuitOpenUntil !== null && this.#circuitOpenUntil > Date.now()
          ? new Date(this.#circuitOpenUntil).toISOString()
          : null,
      budget: {
        usedLastMinute: this.budget.usedLastMinute(),
        maxPerMinute: this.budget.maxPerMinute,
      },
    };
  }
}

export interface Adapter {
  readonly source: SourceId;
  readonly supervisor: Supervisor;
  start(): void;
  stop(): void;
}

/**
 * Base for budgeted-polling adapters (§2.1 "budgeted polling elsewhere").
 * Subclasses implement poll(); supervisor bookkeeping happens here.
 */
export abstract class PollingAdapter implements Adapter {
  abstract readonly source: SourceId;
  readonly supervisor: Supervisor;
  #intervalMs: number;
  #timer: NodeJS.Timeout | null = null;

  constructor(supervisor: Supervisor, intervalMs: number) {
    this.supervisor = supervisor;
    this.#intervalMs = intervalMs;
  }

  /** One fetch+normalize+publish cycle; throw on any problem. */
  protected abstract poll(): Promise<string>;

  /** Return a reason string if required config is missing, else null. */
  protected missingConfig(): string | null {
    return null;
  }

  start(): void {
    const missing = this.missingConfig();
    if (missing !== null) {
      this.supervisor.markDown(missing);
      return; // Stays visibly down; no polling without config.
    }
    const tick = async () => {
      if (!this.supervisor.canAttempt()) return;
      if (!this.supervisor.budget.take()) {
        this.supervisor.reportFailure("rate budget exhausted");
        return;
      }
      try {
        const detail = await this.poll();
        this.supervisor.reportSuccess(detail);
      } catch (err) {
        const { describeError } = await import("../http.ts");
        this.supervisor.reportFailure(describeError(err));
      }
    };
    void tick();
    this.#timer = setInterval(tick, this.#intervalMs);
  }

  stop(): void {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
  }
}
