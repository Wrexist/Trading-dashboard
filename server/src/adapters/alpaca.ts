/**
 * Alpaca adapter (§2.1): streaming 1-minute bars over the IEX websocket.
 * Bars pass the bad-tick filter, are stored, and BarClosed is published.
 *
 * Phase 1 scope: bars only. Quote streaming is deferred — every event is
 * persisted append-only, and tick-rate quotes would bloat the stream before
 * anything consumes them (IDEAS.md if wanted earlier than Phase 2).
 *
 * Note: `ws` does not honor HTTPS_PROXY; on the local-first target machine
 * there is no proxy, so this is acceptable — a proxied environment shows up
 * as a visible connection failure, not a silent gap.
 */

import WebSocket from "ws";
import type { EventBus } from "../bus.ts";
import type { Db } from "../db.ts";
import { isBadTick, RollingWindow } from "../validation/badTick.ts";
import { Supervisor, type Adapter } from "./framework.ts";

const STREAM_URL = "wss://stream.data.alpaca.markets/v2/iex";
const RECONNECT_BASE_MS = 5_000;
const RECONNECT_MAX_MS = 5 * 60_000;

interface AlpacaBarMessage {
  T: "b";
  S: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
  t: string; // bar start time, RFC3339
}

export class AlpacaAdapter implements Adapter {
  readonly source = "alpaca" as const;
  readonly supervisor: Supervisor;
  #bus: EventBus;
  #insertBar;
  #watchlist: string[];
  #ws: WebSocket | null = null;
  #stopped = false;
  #reconnectAttempts = 0;
  #closeWindows = new Map<string, RollingWindow>();
  #rejectedTicks = 0;

  constructor(bus: EventBus, db: Db, watchlist: string[]) {
    this.supervisor = new Supervisor(bus, "alpaca", 200);
    this.#bus = bus;
    this.#watchlist = watchlist;
    this.#insertBar = db.prepare(
      `INSERT OR IGNORE INTO bars
       (symbol, timeframe, closed_at, open, high, low, close, volume, source, fetched_at, staleness_ms)
       VALUES (?, '1m', ?, ?, ?, ?, ?, ?, 'alpaca', ?, ?)`,
    );
  }

  start(): void {
    const key = (process.env.ALPACA_KEY_ID ?? "").trim();
    const secret = (process.env.ALPACA_SECRET_KEY ?? "").trim();
    if (!key || !secret) {
      this.supervisor.markDown(
        "missing env ALPACA_KEY_ID / ALPACA_SECRET_KEY (fill .env, see .env.example)",
      );
      return;
    }
    this.#connect(key, secret);
  }

  stop(): void {
    this.#stopped = true;
    this.#ws?.close();
    this.#ws = null;
  }

  #connect(key: string, secret: string): void {
    if (this.#stopped) return;
    const ws = new WebSocket(STREAM_URL);
    this.#ws = ws;

    ws.on("open", () => {
      ws.send(JSON.stringify({ action: "auth", key, secret }));
    });

    ws.on("message", (raw) => {
      let messages: any[];
      try {
        const parsed = JSON.parse(raw.toString());
        messages = Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        this.supervisor.reportFailure("unparseable websocket frame");
        return;
      }
      for (const msg of messages) this.#handleMessage(msg, ws);
    });

    ws.on("error", (err) => {
      this.supervisor.reportFailure(`websocket error: ${err.message}`);
    });

    ws.on("close", () => {
      if (this.#stopped) return;
      this.#reconnectAttempts++;
      const delay = Math.min(
        RECONNECT_BASE_MS * 2 ** Math.min(this.#reconnectAttempts - 1, 8),
        RECONNECT_MAX_MS,
      );
      this.supervisor.reportFailure(
        `websocket closed; reconnecting in ${Math.round(delay / 1000)}s`,
      );
      setTimeout(() => this.#connect(key, secret), delay);
    });
  }

  #handleMessage(msg: any, ws: WebSocket): void {
    switch (msg.T) {
      case "success":
        if (msg.msg === "authenticated") {
          ws.send(
            JSON.stringify({ action: "subscribe", bars: this.#watchlist }),
          );
        }
        return;
      case "subscription":
        this.#reconnectAttempts = 0;
        this.supervisor.reportSuccess(
          `streaming 1m bars: ${(msg.bars ?? []).join(", ") || "(none)"}`,
        );
        return;
      case "error":
        this.supervisor.reportFailure(`stream error ${msg.code}: ${msg.msg}`);
        if (msg.code === 402 || msg.code === 401) ws.close(); // auth failed
        return;
      case "b":
        this.#handleBar(msg as AlpacaBarMessage);
        return;
      default:
        return; // other channels not subscribed
    }
  }

  #handleBar(bar: AlpacaBarMessage): void {
    let window = this.#closeWindows.get(bar.S);
    if (!window) {
      window = new RollingWindow(120);
      this.#closeWindows.set(bar.S, window);
    }

    if (isBadTick(bar.c, window.values)) {
      this.#rejectedTicks++;
      console.warn(
        `[alpaca] bad tick rejected: ${bar.S} close=${bar.c} (total rejected: ${this.#rejectedTicks})`,
      );
      return; // rejected, counted, visible — never stored as truth
    }
    window.push(bar.c);

    const fetchedAt = new Date();
    // msg.t is the bar START; the 1m bar closes 60s later.
    const closedAt = new Date(new Date(bar.t).getTime() + 60_000);
    this.#insertBar.run(
      bar.S,
      closedAt.toISOString(),
      bar.o,
      bar.h,
      bar.l,
      bar.c,
      bar.v,
      fetchedAt.toISOString(),
      fetchedAt.getTime() - closedAt.getTime(),
    );
    this.#bus.publish({
      type: "BarClosed",
      symbol: bar.S,
      assetClass: "stocks",
      timeframe: "1m",
      bar: {
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v,
        closedAt: closedAt.toISOString(),
      },
      provenance: {
        source: "alpaca",
        fetchedAt: fetchedAt.toISOString(),
        stalenessMs: fetchedAt.getTime() - closedAt.getTime(),
      },
    });
    this.supervisor.reportSuccess(
      `streaming; last bar ${bar.S} @ ${closedAt.toISOString()}`,
    );
  }
}
