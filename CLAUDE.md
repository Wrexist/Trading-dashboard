# SENTINEL — Claude Code project guide

Multi-source trading analysis & decision cockpit. It **ranks and explains — it never promises profit**. Every score shows its inputs. Read `TRADING_SYSTEM_ROADMAP.md` before touching anything.

**Stack:** React 18 / TypeScript / Vite / Zustand / Tailwind / Node.js (Fastify) / SQLite→Postgres / Claude API.
**Layout:** pnpm monorepo — `ui/`, `server/`, `shared/`.

## Phase discipline

- `TASK.md` holds the **current phase only**. Do not scaffold, stub, or "prepare" later-phase work.
- New ideas go to `IDEAS.md`, not into code. Hard-won lessons go to `LEARNINGS.md`.
- Each phase ends at its gate in ROADMAP §4; the gate is checked by the human, not assumed.

## ANTI-PATTERNS (project-specific)

- Modules communicate ONLY via the event bus + typed contracts. No direct imports across module boundaries.
- No data source outside ROADMAP §2 without a TASK.md entry first.
- AI prompts must never output price predictions or invented numbers.
- Risk/sizing/limit logic server-side only — never in UI code.
- Every indicator: pure function, golden-file tested, no I/O.
- Replay paths must pass the point-in-time suite before merge.
- UI: no new top-level element without removing or demoting another (§3 calm budget).
- New ideas → IDEAS.md. TASK.md = current phase only.

## Non-negotiables

- **NEVER generate mock/placeholder market data and present it as real.** If an API fails, the failure is shown visibly (smoke test FAIL, Health view, LOW-confidence demotion) — never papered over with fabricated values.
- **Secrets live in `.env` only** (gitignored). `.env.example` documents the variables; no real keys in the repo, ever.
- Every datum carries `source`, `fetchedAt`, `staleness` and is never displayed without its age (§2.1).
- Append-only stores (event stream, score history, signal log) are never rewritten (§2.2).

## Commands

- `pnpm install` — install workspace deps
- `pnpm typecheck` — typecheck all packages
- `pnpm test` — run server test suite (vitest)
- `pnpm smoke` — Phase 0 smoke test: hits every §2.1 source with real keys from `.env`, prints pass/fail
- `pnpm --filter @sentinel/server dev` — run the backend (port 3001; reads `.env`)
- `pnpm --filter @sentinel/ui dev` — run the UI dev server (port 5173, proxies `/api` to 3001)
