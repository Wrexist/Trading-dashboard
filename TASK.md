# TASK.md — CURRENT PHASE: 1 (Event Bus, Ingestion, Shell)

Scope rule: this file tracks Phase 1 ONLY. Later-phase work is out of bounds until the gate passes. Ideas → `IDEAS.md`.

Carried over from Phase 0 (human, still open — user chose to proceed):
- [ ] API key registration — fill `.env`, run `pnpm smoke` until green on every source
- [ ] Sentry + Tailscale + ntfy setup — forced error visible in Sentry

Phase 1:
- [x] Event bus (typed pub/sub) + append-only persistence of the event stream
- [x] Adapter framework (rate budget, backoff + circuit breaker, health events)
- [x] Adapters: Alpaca WS (1m bars), CoinGecko, Finnhub news
- [x] Validation layer (bad-tick filter, news dedup) + SQLite schemas
- [x] Market-hours module `sessionState(exchange)`
- [x] UI shell: top strip, Signals view (empty state), Health view, command palette skeleton
- [ ] 48h unattended run on the target machine (human — needs keys in `.env`)

**Gate (ROADMAP §4):** 48h unattended run, zero silent failures; every failure visible in Health + Sentry.
