/**
 * HTTP API for the ui (§3.4 — the ui is a projection of the event stream).
 *   GET /api/health  — HealthSnapshot (adapters, budgets, db, sessions)
 *   GET /api/events  — recent events from the append-only stream
 *   GET /api/stream  — live events over SSE
 */

import Fastify, { type FastifyInstance } from "fastify";
import { statSync } from "node:fs";
import type { HealthSnapshot } from "@sentinel/shared/contracts";
import type { EventBus } from "./bus.ts";
import type { EventStore } from "./eventStore.ts";
import type { Db } from "./db.ts";
import type { Adapter } from "./adapters/framework.ts";
import { sessionState } from "./marketHours.ts";
import { captureException, sentryEnabled } from "./sentry.ts";

export interface ApiDeps {
  bus: EventBus;
  store: EventStore;
  db: Db;
  dbPath: string;
  adapters: Adapter[];
  startedAt: Date;
}

export function buildApi(deps: ApiDeps): FastifyInstance {
  const app = Fastify({ logger: false });

  app.setErrorHandler((err: Error, req, reply) => {
    console.error(`[api] ${req.method} ${req.url} failed:`, err);
    captureException(err, { url: req.url });
    void reply.status(500).send({ error: err.message });
  });

  const countRow = (table: "bars" | "news") =>
    Number((deps.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n);

  app.get("/api/health", (): HealthSnapshot => {
    const now = new Date();
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(deps.dbPath).size;
    } catch {
      // :memory: or not yet created — report 0, never a made-up number.
    }
    return {
      startedAt: deps.startedAt.toISOString(),
      now: now.toISOString(),
      session: {
        NYSE: sessionState("NYSE", now),
        CRYPTO: sessionState("CRYPTO", now),
      },
      adapters: deps.adapters.map((a) => a.supervisor.health()),
      db: {
        sizeBytes,
        eventCount: deps.store.count(),
        barCount: countRow("bars"),
        newsCount: countRow("news"),
      },
      sentryEnabled: sentryEnabled(),
    };
  });

  app.get<{ Querystring: { limit?: string } }>("/api/events", (req) => {
    const limit = Math.min(Number(req.query.limit ?? 100) || 100, 1000);
    return deps.store.recent(limit);
  });

  app.get("/api/stream", (req, reply) => {
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    reply.raw.write(":connected\n\n");

    const unsubscribe = deps.bus.subscribeAll((event) => {
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    const heartbeat = setInterval(() => reply.raw.write(":hb\n\n"), 15_000);

    req.raw.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  return app;
}
