# TRADING_SYSTEM_ROADMAP.md
## Project: SENTINEL — Multi-Source Trading Analysis & Decision Cockpit
**Stack:** React 18 / TypeScript / Vite / Zustand / Tailwind / Node.js (Fastify) / SQLite→Postgres / Claude API
**Owner:** Isac (Wrexist)
**Version:** 3.0
**Status:** Phase 0 — Spec
**Hard rule:** This system RANKS and EXPLAINS. It never promises profit. Every score must show its inputs (AlphaDesk anti-fabrication philosophy applies globally).

---

## v3 CHANGELOG — WHAT'S NEW

| # | Addition | Why |
|---|---|---|
| 1 | **Event bus core** (§2.0) | Modules now collaborate through typed events instead of isolated pipelines — regime shifts, health failures, and risk breaches propagate system-wide instantly |
| 2 | **Confluence & Divergence Engine** (§2.10) | Cross-module fusion: independent modules agreeing raises conviction; disagreeing gets flagged (divergence is information, not noise) |
| 3 | **Cross-Asset Intelligence** (§2.11) | Lead-lag relationships: BTC→alts, indices→high-beta, DXY/yields→risk assets, funding extremes→mean-reversion context |
| 4 | **Feedback Loop System** (§2.12) | Eval results + journal outcomes flow back as *proposed* weight changes and setup prioritization — human-approved, walk-forward validated |
| 5 | **Three-agent AI pipeline** (§2.5) | Analyst → Devil's Advocate → Referee; disagreements surfaced explicitly instead of averaged away |
| 6 | **Watchdog / meta-monitor** (§2.13) | The system that watches the system: score-distribution drift, data-quality drift, alert fatigue |
| 7 | **Narrative Tracker** (§2.14) | Clusters news/sentiment into evolving narratives (sector rotation, memecoin metas) and links them to tickers |
| 8 | **Minimalist UI design spec** (§3) | Full design language: progressive disclosure, command palette, one accent color, glance-first mobile view |

v2 changelog (15 flaw-fixes) retained in git history.

---

## 1. DESIGN PRINCIPLES

1. **Transparent scoring, never black-box.** Inputs → weights → score → confidence → what changes the verdict. Fusion layers must be equally inspectable.
2. **Decision support, not decision making.** The human executes.
3. **Point-in-time discipline.** Historical evaluation only sees data that existed at that moment — architecturally enforced.
4. **Modules collaborate, but stay independent.** Every module must run and be tested in isolation; collaboration happens only via the event bus and typed contracts. No hidden coupling.
5. **Risk layer is server-side, non-negotiable, un-bypassable from UI.**
6. **Paper-trade gate before real capital, per strategy profile.**
7. **No auto-execution in v1.**
8. **Local-first.** Tailscale for phone. No cloud exposure.
9. **Calm technology.** The UI shows the minimum needed to decide, with everything else one interaction away. Silence is the default state.
10. **Anti-pivot guard:** ideas → IDEAS.md; TASK.md = current phase only.

---

## 2. SYSTEM ARCHITECTURE

### 2.0 Event Bus Core (the collaboration backbone — new in v3)
In-process typed event bus (simple pub/sub over TypeScript discriminated unions; NATS only if ever distributed).

**Event catalog (all versioned in `shared/events.ts`):**
- `BarClosed`, `QuoteTick`, `NewsArrived`, `TokenDiscovered`
- `RegimeChanged { assetClass, from, to, evidence[] }`
- `SignalEmitted { profile, symbol, score, factors[], confidence }`
- `ConfluenceDetected` / `DivergenceDetected` (§2.10)
- `AdapterUnhealthy` / `AdapterRecovered`
- `RiskLimitBreached`, `EventLockoutActive`
- `EvalCompleted { weightsHash, metrics }`, `WeightProposal` (§2.12)
- `DriftWarning` (§2.13)

**Collaboration rules (examples of modules working together):**
- `RegimeChanged` → Ranking engine hot-swaps weight profile → Alert engine re-evaluates thresholds → UI Regime Bar pulses once
- `AdapterUnhealthy` → all signals depending on that source instantly demoted to LOW confidence → Watchdog logs → alert if it feeds an active profile
- `RiskLimitBreached` → journal locks → alert engine mutes non-critical alerts for the day (no revenge-trade bait) → AI Risk note generated for tomorrow's briefing
- `DivergenceDetected` → AI Referee is asked to explain the disagreement in the next briefing

Every event is persisted (append-only) → the replay harness replays the event stream itself, so *the collaboration logic is backtestable too*, not just the indicators.

### 2.1 Ingestion Layer
- Adapter interface: `fetch()`, `normalize()`, `healthCheck()`, `rateBudget`, `backoff` (exponential + circuit breaker).
- Streaming where available (Alpaca WS, Binance WS); budgeted polling elsewhere.
- Sources: Alpaca (stocks bars/quotes), IBKR Web API (portfolio, read-only v1), CoinGecko + Binance WS (crypto majors), DexScreener + Birdeye + Helius (Solana memecoins), RugCheck (token safety), Finnhub (news, econ calendar, fundamentals), Reddit (mention velocity), FRED (macro), Binance funding rates.
- Every datum: `source`, `fetchedAt`, `staleness`. **Never displayed without its age.**
- Timestamps UTC internally; CET/CEST display. Market-hours module: `sessionState(exchange)`.

### 2.2 Validation & Storage
- Bad-tick filter (> N σ from rolling median), corporate-action handling (adjusted bars + unhandled-split quarantine), news dedup (canonical item per story).
- Bar retention: 1m×30d, 5m×180d, daily×10y. SQLite v1.
- Score history, signal log, event stream: **append-only**.

### 2.3 Analysis Engine (deterministic, pure, golden-file tested)
- **Per-profile timeframes:** DAYTRADE 1m/5m/15m + daily context; SWING daily/weekly; INVEST daily/weekly + fundamentals; MEMECOIN snapshot-based.
- **Technical:** EMA(9/21/50/200) alignment, ADX, RSI(14), MACD histogram slope, ATR(14), Bollinger width percentile, relative volume, OBV slope, key levels (PDH/PDL, premarket H/L, 52w distance).
- **Regime:** SPY vs 200d, VIX level+slope, BTC dominance, total-mcap trend, funding extremes → `RISK_ON | NEUTRAL | RISK_OFF` per asset class → emits `RegimeChanged`.
- **Event awareness:** per-symbol `nextEvent` (earnings/FOMC/CPI); risk core enforces lockouts.
- **Fundamentals (SWING/INVEST):** Finnhub basics.
- **Sentiment:** Reddit mention-velocity z-score; news polarity via Claude Haiku (content-hash cached).
- **Memecoin safety (hard filters BEFORE scoring):** REJECT if mint authority not revoked, LP not locked/burned, top-10 holders >30%, honeypot flag, age below minimum, liquidity <$50k. Survivors scored: liq growth, holder growth, volume/mcap, smart-wallet inflow. **Scope: filters traps; never snipes. Sniping is out of scope permanently.**

### 2.4 Ranking Engine + Shadow Mode
- Weighted composite per profile; weights in versioned `weights.vN.json`; every eval bound to weights hash.
- Output: `score 0-100`, `confidence` (capped MED if any input stale/missing), `topFactors[]`, `killSwitches[]`.
- **Shadow mode:** every above-threshold signal auto-logged with full input snapshot, traded or not — evaluation measures the system, not your attention.

### 2.5 AI Layer — Three-Agent Pipeline (upgraded in v3)
Deterministic layers never depend on AI. AI synthesizes on top.

1. **Analyst (Sonnet):** 5-line thesis per top candidate, must cite specific input data points. Hard constraint: "If data is insufficient, say so. Never invent numbers."
2. **Devil's Advocate (Sonnet, separate context):** receives the same data + the thesis; attacks it. What contradicts? What's the base rate against?
3. **Referee (Sonnet):** receives both + confluence/divergence report (§2.10); outputs a final brief that must state where the two agents *disagree* and which data would resolve it. Disagreement is surfaced, never averaged away.
- **Risk Officer note (Haiku, daily):** reviews yesterday's journal vs your own stated rules; one paragraph, appears in morning briefing.
- Haiku handles all high-volume classification (sentiment, dedup assist, journal validation). Budget guard: daily token cap; on breach AI panel degrades to "budget reached," scoring unaffected.
- All AI output labeled "AI synthesis — verify before acting."

### 2.6 Risk Core (server-side, un-bypassable)
- Fixed-fractional sizing (default 1% risk/trade); Kelly ×0.25 informational only.
- Max daily loss 3R → journal locks; breach → `RISK_LOG.md` + push + alert-mute for the day.
- Correlated exposure cap (3 positions, stocks/crypto majors only, 90d correlation). Memecoin hard bucket cap (100%-loss-possible capital).
- Event lockouts: ±30 min FOMC/CPI/NFP for DAYTRADE; no earnings-holds on DAYTRADE/SWING without explicit journal acknowledgment.

### 2.7 Replay & Evaluation Harness
- Re-runs the full pipeline **including the event stream** over any historical range, point-in-time enforced (`fetchedAt <= simTime` on every query).
- Outputs: score-vs-forward-return (1h/1d/5d), hit rate by score decile, per-factor contribution, confluence-vs-plain-signal comparison (§2.10 must earn its keep).
- Walk-forward protocol: tune on A, validate on B, roll; final holdout touched exactly once ever.

### 2.8 Alert Engine
- Triggers: score thresholds, price/level, relative-volume spikes, new scanner survivors, risk breaches, adapter health, staleness, `DivergenceDetected` on held positions.
- Delivery: ntfy.sh or Telegram → phone. Quiet hours (CET-aware; US open 15:30 CET). Alert-fatigue metric feeds Watchdog.
- Every alert deep-links to the factor breakdown.

### 2.9 Observability
- Sentry (backend errors), Health view (adapter status, budgets, DB size). Unhealthy adapter → dependent profiles auto-demote to LOW confidence.

### 2.10 Confluence & Divergence Engine (new in v3)
The fusion layer where modules genuinely work together — kept honest:
- **Confluence:** N independent modules (technical, sentiment, regime, cross-asset, narrative) aligning on the same symbol/direction → `ConfluenceDetected`, conviction tier raised. "Independent" is enforced: modules sharing >50% input data can't count twice (declared in a dependency manifest).
- **Divergence:** modules disagreeing (e.g., technicals bullish, smart-wallet outflow) → `DivergenceDetected`, flagged prominently. Divergence on a held position always alerts.
- Fusion output is inspectable like everything else: which modules, which direction, what weight.
- **Honesty clause:** confluence raises *conviction tiers*, not predicted returns. §2.7 replay must show confluence signals actually outperform plain signals; if they don't after evaluation, this engine gets simplified, not defended.

### 2.11 Cross-Asset Intelligence (new in v3)
- Rolling lead-lag and beta relationships: BTC→alt majors, SPY/QQQ→high-beta names, DXY & 10Y yields→risk assets, funding-rate extremes→mean-reversion context, sector ETF flows→member stocks.
- Publishes context events consumed by ranking (regime-conditional weights) and by the Referee agent (macro context in briefs).
- All relationships computed from stored data with confidence intervals — displayed as "historically, X has led Y by ~Z bars (r=…)", never as certainty.

### 2.12 Feedback Loop System (new in v3)
Closes the loop from outcomes back to configuration — with a human gate:
- `EvalCompleted` + journal expectancy per setup-tag → **Weight Proposal generator**: "factor F contributed negatively across 3 eval windows; propose reducing weight from 0.15 → 0.08."
- Proposals are *never auto-applied*: they appear in UI, you approve → new `weights.vN+1.json` committed → validated walk-forward before going live.
- Setup tags with negative expectancy after ≥20 trades get visually deprioritized on the Signal Board (still logged in shadow mode — they can earn their way back).

### 2.13 Watchdog / Meta-Monitor (new in v3)
- **Score-distribution drift:** if today's score distribution diverges sharply from the trailing norm (KS-test style check), emit `DriftWarning` — something broke or the market changed; either way, don't trust signals blindly.
- **Data-quality drift:** rising bad-tick rates, staleness creep, dedup anomalies.
- **Alert fatigue:** alerts/day trending up + acknowledgment rate trending down → propose threshold tightening.
- Watchdog can only warn and propose — it never silently changes behavior.

### 2.14 Narrative Tracker (new in v3)
- Clusters deduplicated news + sentiment spikes into named narratives (Haiku-assisted labeling, cached): sector rotations, macro themes, memecoin metas.
- Each narrative: linked tickers/tokens, momentum (rising/fading), first-seen date.
- Feeds: Signal Board context chips, Referee briefs, Scanner (tokens riding a fading meta get flagged).

---

## 3. UI — MINIMALIST DESIGN SPEC (new in v3)

### 3.1 Design language
- **Calm by default.** The resting state is a nearly-empty screen: regime strip, a short signal list, risk status. No dashboards-of-dashboards, no grid of widgets.
- **Progressive disclosure.** Top level shows ≤7 data points per row. Factor breakdowns, AI briefs, charts — all one click/tap deeper. Nothing is two levels deep that you need in the moment; nothing is at top level that you don't.
- **One accent color** (signal green/red excepted). Dark theme only in v1. Neutral grays (zinc scale), accent used exclusively for interactive elements and confluence markers.
- **Typography-driven:** Inter for UI, tabular mono (Geist Mono/JetBrains Mono) for all numbers — columns of prices must align. Type scale does the hierarchy work; boxes and borders are last resorts.
- **Data-ink ratio:** no card shadows, no gradients, hairline dividers only. Sparklines over full charts at top level.
- **Motion:** one pulse animation on `RegimeChanged`, subtle row highlight on new signals. Nothing else moves. A trading UI that blinks constantly trains you to overtrade.

### 3.2 Layout
- **Single-column focus layout,** max-width ~1100px even on desktop. No sidebar.
- **Top strip (persistent, ~40px):** regime per asset class (three dots + label), session state, risk status (green/locked), staleness indicator. The whole system's health in one glance line.
- **Command palette (Cmd+K) replaces all navigation:** jump to symbol, open journal, run replay, ack alerts, switch profile. Menus are failure of the palette.
- **Views (each a single screen, no tabs-within-tabs):**
  1. **Signals** (default): dense rows — symbol · score · confidence dot · confluence marker · top factor · age. Tap → full breakdown sheet (factors, kill-switches, AI brief, divergences).
  2. **Scanner** (memecoins): survivor rows with safety grade badge; tap → full safety report.
  3. **Journal:** entry form is one screen, ≤8 fields, keyboard-first. Expectancy stats per setup as a simple sorted list.
  4. **Replay/Eval:** decile table + one scatter. Weights-version diff view.
  5. **Health:** adapter list, budgets, drift warnings.
- **Empty states are informative:** "No signals above threshold. Last evaluated 21:42. Regime: RISK_OFF (thresholds auto-raised)." Silence with a reason.

### 3.3 Mobile (Tailscale, read-mostly)
- **Glance view:** top strip + top 5 signals + active alerts + risk status. One screen, zero navigation.
- Journal entry and alert acknowledgment are the only write actions on mobile. No order-related actions from the phone, ever (deliberate friction).

### 3.4 Implementation notes
- Tailwind + shadcn/ui (Dialog, Command, Sheet, Sonner toasts) — consistent with your stack; strip shadcn defaults to match §3.1 (no shadows, tighter radii).
- Zustand stores mirror event-bus topics 1:1 — UI state is a projection of the event stream, which keeps UI dumb and testable.
- Virtualized lists for signal/scanner rows; WS updates batched per animation frame.

---

## 4. ROADMAP (v3)

### Phase 0 — Spec & Foundations
- [ ] API keys + smoke tests (all sources incl. ntfy/Telegram)
- [ ] pnpm monorepo (ui / server / shared), event catalog in `shared/events.ts`, CLAUDE.md, TASK.md, LEARNINGS.md, IDEAS.md, weights.v1.json, .env
- [ ] Sentry + Tailscale
**Gate:** smoke script green on every source; forced error visible in Sentry.

### Phase 1 — Event Bus, Ingestion, Shell (1–2 weeks)
- [ ] Event bus + persistence of event stream (append-only)
- [ ] Adapter framework + Alpaca WS, CoinGecko, Finnhub news; validation layer; SQLite schemas; market-hours module
- [ ] UI: top strip, Signals shell (empty-state), Health view, command palette skeleton
**Gate:** 48h unattended run, zero silent failures; every failure visible in Health + Sentry.

### Phase 2 — Analysis, Ranking, Replay (stocks) (2–3 weeks)
- [ ] Technical + regime modules (golden-file tested), multi-timeframe per profile
- [ ] Ranking + shadow mode (recording starts NOW), Signals view live with progressive-disclosure breakdown sheet
- [ ] Replay harness incl. event-stream replay, point-in-time test suite
**Gate:** 10 historical days replay byte-for-byte reproducible; injected lookahead bug caught by test suite.

### Phase 3 — Fusion & Cross-Asset (1–2 weeks) *(new)*
- [ ] Confluence/Divergence engine + dependency manifest
- [ ] Cross-asset lead-lag module
- [ ] Replay comparison: confluence vs plain signals (the engine must earn its keep here before it influences anything)
**Gate:** fusion output fully inspectable in UI; replay comparison report generated.

### Phase 4 — Memecoin Scanner (1–2 weeks)
- [ ] DexScreener + Birdeye + RugCheck adapters; safety filters; survivor scoring; Scanner view; Narrative Tracker (basic)
**Gate:** ≥90% rejection of 50 known historical rugs. Not shippable otherwise.

### Phase 5 — AI Pipeline, Journal, Risk, Alerts (1–2 weeks)
- [ ] Three-agent pipeline (Analyst/Devil's Advocate/Referee) + Risk Officer note + budget guard
- [ ] Journal + risk core + event lockouts + Alert engine → phone + mobile glance view
**Gate:** 20 spot-checked AI runs contain zero invented numbers; simulated 3R day locks journal + mutes alerts; test alert reaches phone.

### Phase 6 — Evaluation & Paper Trading (≈3 months calendar, low effort)
- [ ] Walk-forward tuning via replay; Weight Proposal loop live (human-approved)
- [ ] Watchdog drift monitors active
- [ ] ≥30 forward paper trades per profile; monthly reviews (expectancy per setup, decile returns, shadow-vs-traded, confluence performance)
**Gate (THE gate):** positive expectancy ≥30 forward trades AND score-decile returns monotonic-ish AND shadow log confirms no cherry-picking. Fail → iterate or kill the profile. No proceeding on hope.

### Phase 7 — Execution Integration (only after Phase 6 gate, per profile)
- [ ] IBKR orders: mandatory confirm + risk-core pre-check on every order. Desktop only.
- [ ] Memecoins never auto-routed; manual, bucket-capped.

---

## 5. CLAUDE CODE PROJECT FILES (seed)

### CLAUDE.md additions
```
ANTI-PATTERNS (project-specific):
- Modules communicate ONLY via the event bus + typed contracts. No direct imports across module boundaries.
- No data source outside ROADMAP §2 without a TASK.md entry first.
- AI prompts must never output price predictions or invented numbers.
- Risk/sizing/limit logic server-side only — never in UI code.
- Every indicator: pure function, golden-file tested, no I/O.
- Replay paths must pass the point-in-time suite before merge.
- UI: no new top-level element without removing or demoting another (§3 calm budget).
- New ideas → IDEAS.md. TASK.md = current phase only.
```

### TASK.md seed
```
CURRENT PHASE: 0
- [ ] API key registration + smoke tests (all sources)
- [ ] pnpm monorepo scaffold + shared/events.ts catalog
- [ ] Sentry + Tailscale + ntfy setup
```

---

## 6. COST ESTIMATE (monthly, v1)

| Source | Free tier enough? | Paid if needed |
|---|---|---|
| Alpaca data (IEX, WS) | Yes | Polygon $29 later |
| Finnhub / CoinGecko / Binance / DexScreener / RugCheck / Helius / FRED / Reddit | Yes | $0 |
| Birdeye | Limited — start free | ~$99 (defer) |
| ntfy / Telegram / Sentry / Tailscale | Yes | $0 |
| Claude API (Haiku-heavy + Sonnet agents, budget-capped) | — | ~$15–35 |
| **Total v1** | | **~$15–65/mo** |

---

## 7. SWEDEN PRACTICAL NOTES

- US regular session = 15:30–22:00 CET — quiet hours, alert design, and DAYTRADE profile assume evening trading.
- Account structure (ISK vs depå vs via AB) materially changes tax outcomes for active trading — decide before Phase 7, with an accountant.

---

## 8. HONEST EXPECTATIONS (keep in repo, re-read monthly)

- The realistic edge: discipline, synthesis speed, trap-filtering, honest self-measurement — not prediction.
- Confluence raises conviction, not certainty. §2.10 must prove itself in replay or get simplified.
- Most retail daytraders lose money; memecoins are near-adversarial. The scanner filters traps; it does not find guaranteed winners.
- The more advanced the system, the stronger the temptation to trust it blindly. The Watchdog, the holdout, and the shadow log exist because of that temptation.
- Success metric: fewer impulsive trades, documented expectancy, zero blown risk limits, a shadow log you can trust — not "getting rich."
