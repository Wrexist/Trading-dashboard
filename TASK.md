# TASK.md — CURRENT PHASE: 0 (Spec & Foundations)

Scope rule: this file tracks Phase 0 ONLY. Later-phase work is out of bounds until the gate passes. Ideas → `IDEAS.md`.

- [x] pnpm monorepo scaffold (ui / server / shared) + project files (CLAUDE.md, TASK.md, LEARNINGS.md, IDEAS.md, weights.v1.json)
- [x] `shared/events.ts` event catalog (ROADMAP §2.0)
- [x] `.env.example` + smoke-test script covering every §2.1 source (+ ntfy/Telegram per Phase 0 gate) — `pnpm smoke`
- [ ] API key registration (human) — fill `.env`, run `pnpm smoke` until green on every source
- [ ] Sentry + Tailscale + ntfy setup (human: accounts/devices) — forced error visible in Sentry

**Gate (ROADMAP §4):** smoke script green on every source; forced error visible in Sentry.
