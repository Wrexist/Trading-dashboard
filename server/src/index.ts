/**
 * SENTINEL server boot: Sentry → SQLite → event bus → adapters → API.
 * Phase 1 gate: 48h unattended, zero silent failures — everything that can
 * fail reports to the bus (Health view) and Sentry.
 */

import "dotenv/config";
import { resolve } from "node:path";
import { initSentry, captureException } from "./sentry.ts";
import { openDb, pruneBars } from "./db.ts";
import { EventStore } from "./eventStore.ts";
import { EventBus } from "./bus.ts";
import { AlpacaAdapter } from "./adapters/alpaca.ts";
import { CoinGeckoAdapter } from "./adapters/coingecko.ts";
import { FinnhubNewsAdapter } from "./adapters/finnhub.ts";
import type { Adapter } from "./adapters/framework.ts";
import { buildApi } from "./api.ts";

const startedAt = new Date();
initSentry();

const dbPath =
  (process.env.SENTINEL_DB_PATH ?? "").trim() ||
  resolve(import.meta.dirname, "../data/sentinel.sqlite");
const db = openDb(dbPath);
const store = new EventStore(db);
const bus = new EventBus(store);
bus.onSubscriberError = (err, event) =>
  captureException(err, { eventType: event.type, eventId: event.eventId });

// Ops visibility: log every non-tick event; ticks would drown the console.
bus.subscribeAll((event) => {
  if (event.type === "QuoteTick" || event.type === "BarClosed") return;
  console.log(`[bus] ${event.emittedAt} ${event.type}`, JSON.stringify(event).slice(0, 200));
});

const watchlist = ((process.env.WATCHLIST ?? "").trim() || "SPY,QQQ,AAPL")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

const adapters: Adapter[] = [
  new AlpacaAdapter(bus, db, watchlist),
  new CoinGeckoAdapter(bus),
  new FinnhubNewsAdapter(bus, db),
];
for (const adapter of adapters) adapter.start();

// §2.2 retention: prune expired 1m/5m bars hourly.
const pruneTimer = setInterval(() => {
  try {
    const pruned = pruneBars(db);
    if (pruned > 0) console.log(`[db] pruned ${pruned} expired bars`);
  } catch (err) {
    console.error("[db] prune failed:", err);
    captureException(err);
  }
}, 3_600_000);

const app = buildApi({ bus, store, db, dbPath, adapters, startedAt });
const port = Number(process.env.PORT ?? 3001);
const host = (process.env.HOST ?? "127.0.0.1").trim();

try {
  await app.listen({ port, host });
  console.log(`[server] listening on http://${host}:${port}`);
  console.log(`[server] db: ${dbPath}`);
  console.log(`[server] watchlist: ${watchlist.join(", ")}`);
} catch (err) {
  console.error("[server] failed to start:", err);
  captureException(err);
  process.exit(1);
}

async function shutdown(signal: string): Promise<void> {
  console.log(`[server] ${signal} — shutting down`);
  clearInterval(pruneTimer);
  for (const adapter of adapters) adapter.stop();
  await app.close();
  db.close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
