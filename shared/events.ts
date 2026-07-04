/**
 * SENTINEL event catalog — ROADMAP §2.0.
 *
 * Modules collaborate ONLY through these typed events (discriminated union on
 * `type`) plus shared contracts. No direct imports across module boundaries.
 *
 * Versioning: the catalog carries EVENT_CATALOG_VERSION and every persisted
 * event envelope records the catalog version it was emitted under, so the
 * append-only event stream stays replayable across schema evolution (§2.7).
 *
 * Phase 0 defines the contracts only. The in-process pub/sub bus and event
 * persistence are Phase 1.
 */

export const EVENT_CATALOG_VERSION = 1 as const;

// ---------------------------------------------------------------------------
// Shared vocabulary
// ---------------------------------------------------------------------------

export type AssetClass = "stocks" | "crypto" | "memecoin";

export type Profile = "DAYTRADE" | "SWING" | "INVEST" | "MEMECOIN";

export type Regime = "RISK_ON" | "NEUTRAL" | "RISK_OFF";

/** §2.4 — confidence is capped at MED if any input is stale or missing. */
export type Confidence = "LOW" | "MED" | "HIGH";

export type Timeframe = "1m" | "5m" | "15m" | "1h" | "1d" | "1w";

/** §2.1 data sources (the only permitted sources; adding one requires a TASK.md entry first). */
export type SourceId =
  | "alpaca"
  | "ibkr"
  | "coingecko"
  | "binance"
  | "dexscreener"
  | "birdeye"
  | "helius"
  | "rugcheck"
  | "finnhub"
  | "reddit"
  | "fred";

/**
 * §2.1 — every datum carries its provenance and is never displayed without
 * its age. Timestamps are UTC ISO-8601 strings (display converts to CET/CEST).
 */
export interface Provenance {
  source: SourceId;
  fetchedAt: string;
  /** Milliseconds between fetchedAt and the datum's own timestamp. */
  stalenessMs: number;
}

/** Envelope common to every event; the stream is append-only (§2.2). */
export interface EventEnvelope {
  /** Unique id assigned at emit time (bus, Phase 1). */
  eventId: string;
  /** Emit timestamp, UTC ISO-8601. */
  emittedAt: string;
  catalogVersion: typeof EVENT_CATALOG_VERSION;
}

// ---------------------------------------------------------------------------
// Market data & discovery events
// ---------------------------------------------------------------------------

export interface Bar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Bar close time, UTC ISO-8601. */
  closedAt: string;
}

export interface BarClosed extends EventEnvelope {
  type: "BarClosed";
  symbol: string;
  assetClass: AssetClass;
  timeframe: Timeframe;
  bar: Bar;
  provenance: Provenance;
}

export interface QuoteTick extends EventEnvelope {
  type: "QuoteTick";
  symbol: string;
  assetClass: AssetClass;
  bid: number;
  ask: number;
  last: number;
  /** Exchange/venue timestamp of the tick, UTC ISO-8601. */
  tickAt: string;
  provenance: Provenance;
}

export interface NewsArrived extends EventEnvelope {
  type: "NewsArrived";
  /** Canonical item id after dedup (§2.2 — one canonical item per story). */
  canonicalId: string;
  headline: string;
  url: string;
  symbols: string[];
  publishedAt: string;
  provenance: Provenance;
}

export interface TokenDiscovered extends EventEnvelope {
  type: "TokenDiscovered";
  /** Chain address (mint) of the token. */
  address: string;
  chain: "solana";
  symbol: string;
  discoveredAt: string;
  provenance: Provenance;
}

// ---------------------------------------------------------------------------
// Regime & signals
// ---------------------------------------------------------------------------

/** §2.0 — RegimeChanged { assetClass, from, to, evidence[] } */
export interface RegimeChanged extends EventEnvelope {
  type: "RegimeChanged";
  assetClass: AssetClass;
  from: Regime;
  to: Regime;
  /** Human-readable inputs that flipped the regime (SPY vs 200d, VIX, funding, …). */
  evidence: string[];
}

export interface SignalFactor {
  name: string;
  weight: number;
  /** Factor's contribution to the composite score. */
  contribution: number;
  provenance: Provenance;
}

/** §2.0 — SignalEmitted { profile, symbol, score, factors[], confidence } */
export interface SignalEmitted extends EventEnvelope {
  type: "SignalEmitted";
  profile: Profile;
  symbol: string;
  /** Composite score 0–100 (§2.4). */
  score: number;
  factors: SignalFactor[];
  confidence: Confidence;
  /** Hard disqualifiers that fired (§2.4). */
  killSwitches: string[];
  /** Hash of the weights.vN.json the score was computed under. */
  weightsHash: string;
}

// ---------------------------------------------------------------------------
// Confluence & divergence (§2.10)
// ---------------------------------------------------------------------------

export type FusionModule =
  | "technical"
  | "sentiment"
  | "regime"
  | "cross-asset"
  | "narrative";

export type Direction = "bullish" | "bearish";

/** Fusion output is inspectable: which modules, which direction, what weight. */
export interface FusionVote {
  module: FusionModule;
  direction: Direction;
  weight: number;
}

/** Raises conviction tiers, never predicted returns (§2.10 honesty clause). */
export interface ConfluenceDetected extends EventEnvelope {
  type: "ConfluenceDetected";
  symbol: string;
  direction: Direction;
  /** Independent modules agreeing (independence enforced via dependency manifest). */
  votes: FusionVote[];
}

/** Divergence is information, not noise; on a held position it always alerts. */
export interface DivergenceDetected extends EventEnvelope {
  type: "DivergenceDetected";
  symbol: string;
  /** The disagreeing module votes. */
  votes: FusionVote[];
  heldPosition: boolean;
}

// ---------------------------------------------------------------------------
// Adapter health (§2.1, §2.9)
// ---------------------------------------------------------------------------

export interface AdapterUnhealthy extends EventEnvelope {
  type: "AdapterUnhealthy";
  source: SourceId;
  reason: string;
  /** Consecutive failures observed by the circuit breaker. */
  failureCount: number;
}

export interface AdapterRecovered extends EventEnvelope {
  type: "AdapterRecovered";
  source: SourceId;
  downForMs: number;
}

// ---------------------------------------------------------------------------
// Risk (§2.6)
// ---------------------------------------------------------------------------

export interface RiskLimitBreached extends EventEnvelope {
  type: "RiskLimitBreached";
  limit: "max-daily-loss" | "correlated-exposure" | "memecoin-bucket";
  detail: string;
  /** Journal locks and non-critical alerts mute for the day (§2.0 collaboration rules). */
  lockActions: string[];
}

export interface EventLockoutActive extends EventEnvelope {
  type: "EventLockoutActive";
  /** e.g. FOMC, CPI, NFP, earnings. */
  eventName: string;
  affectedProfiles: Profile[];
  symbols: string[];
  startsAt: string;
  endsAt: string;
}

// ---------------------------------------------------------------------------
// Evaluation & feedback loop (§2.7, §2.12)
// ---------------------------------------------------------------------------

/** §2.0 — EvalCompleted { weightsHash, metrics } */
export interface EvalCompleted extends EventEnvelope {
  type: "EvalCompleted";
  weightsHash: string;
  /** e.g. hit rate by decile, per-factor contribution, confluence-vs-plain comparison. */
  metrics: Record<string, number>;
  rangeStart: string;
  rangeEnd: string;
}

/** §2.12 — proposals are NEVER auto-applied; human approval + walk-forward validation required. */
export interface WeightProposal extends EventEnvelope {
  type: "WeightProposal";
  profile: Profile;
  factor: string;
  currentWeight: number;
  proposedWeight: number;
  /** Evidence, e.g. "factor contributed negatively across 3 eval windows". */
  rationale: string;
  basedOnWeightsHash: string;
}

// ---------------------------------------------------------------------------
// Watchdog (§2.13)
// ---------------------------------------------------------------------------

/** Watchdog only warns and proposes — it never silently changes behavior. */
export interface DriftWarning extends EventEnvelope {
  type: "DriftWarning";
  kind: "score-distribution" | "data-quality" | "alert-fatigue";
  detail: string;
  /** Where to look, e.g. affected source or profile. */
  scope: string;
}

// ---------------------------------------------------------------------------
// The catalog
// ---------------------------------------------------------------------------

export type SentinelEvent =
  | BarClosed
  | QuoteTick
  | NewsArrived
  | TokenDiscovered
  | RegimeChanged
  | SignalEmitted
  | ConfluenceDetected
  | DivergenceDetected
  | AdapterUnhealthy
  | AdapterRecovered
  | RiskLimitBreached
  | EventLockoutActive
  | EvalCompleted
  | WeightProposal
  | DriftWarning;

export type SentinelEventType = SentinelEvent["type"];

/** Exhaustive list of event types, for runtime validation and topic wiring (Phase 1). */
export const EVENT_TYPES = [
  "BarClosed",
  "QuoteTick",
  "NewsArrived",
  "TokenDiscovered",
  "RegimeChanged",
  "SignalEmitted",
  "ConfluenceDetected",
  "DivergenceDetected",
  "AdapterUnhealthy",
  "AdapterRecovered",
  "RiskLimitBreached",
  "EventLockoutActive",
  "EvalCompleted",
  "WeightProposal",
  "DriftWarning",
] as const satisfies readonly SentinelEventType[];
