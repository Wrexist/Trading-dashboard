# TASK.md — CURRENT PHASE: 1 (Event Bus, Ingestion, Shell)

Scope rule: this file tracks Phase 1 ONLY. Later-phase work is out of bounds until the gate passes. Ideas → `IDEAS.md`.

Carried over from Phase 0 (human, still open — user chose to proceed):
- [ ] API key registration — fill `.env`, run `pnpm smoke` until green on every source
- [ ] Sentry + Tailscale + ntfy setup — forced error visible in Sentry

Phase 1:
- [ ] Event bus (typed pub/sub) + append-only persistence of the event stream
- [ ] Adapter framework (`fetch/normalize/healthCheck/rateBudget/backoff` + circuit breaker)
- [ ] Adapters: Alpaca WS, CoinGecko, Finnhub news
- [ ] Validation layer (bad-tick filter, news dedup) + SQLite schemas
- [ ] Market-hours module `sessionState(exchange)`
- [ ] UI shell: top strip, Signals view (empty state), Health view, command palette skeleton

**Gate (ROADMAP §4):** 48h unattended run, zero silent failures; every failure visible in Health + Sentry.
