/**
 * Zustand stores mirror bus topics 1:1 (§3.4) — the UI is a projection of
 * the event stream. Live events arrive over SSE and are flushed once per
 * animation frame; health snapshots are polled.
 */

import { create } from "zustand";
import type { SentinelEvent } from "@sentinel/shared/events";
import type { HealthSnapshot } from "@sentinel/shared/contracts";

const EVENT_BUFFER = 500;

interface HealthState {
  snapshot: HealthSnapshot | null;
  /** Last fetch error — shown, never hidden (§2.1: failures are visible). */
  error: string | null;
  fetchedAtMs: number | null;
}

export const useHealth = create<HealthState>(() => ({
  snapshot: null,
  error: null,
  fetchedAtMs: null,
}));

export function startHealthPolling(intervalMs = 5_000): () => void {
  let stopped = false;
  const poll = async () => {
    try {
      const res = await fetch("/api/health");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const snapshot = (await res.json()) as HealthSnapshot;
      if (!stopped) useHealth.setState({ snapshot, error: null, fetchedAtMs: Date.now() });
    } catch (err) {
      if (!stopped)
        useHealth.setState({
          error: err instanceof Error ? err.message : String(err),
          fetchedAtMs: Date.now(),
        });
    }
  };
  void poll();
  const timer = setInterval(poll, intervalMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

interface EventsState {
  /** Newest first, capped ring buffer. */
  events: SentinelEvent[];
  connected: boolean;
  receivedTotal: number;
}

export const useEvents = create<EventsState>(() => ({
  events: [],
  connected: false,
  receivedTotal: 0,
}));

export function startEventStream(): () => void {
  const source = new EventSource("/api/stream");
  let queue: SentinelEvent[] = [];
  let frame: number | null = null;

  // §3.4: WS/SSE updates batched per animation frame.
  const flush = () => {
    frame = null;
    if (queue.length === 0) return;
    const incoming = queue;
    queue = [];
    useEvents.setState((prev) => ({
      events: [...incoming.reverse(), ...prev.events].slice(0, EVENT_BUFFER),
      receivedTotal: prev.receivedTotal + incoming.length,
    }));
  };

  source.onmessage = (msg) => {
    try {
      queue.push(JSON.parse(msg.data) as SentinelEvent);
    } catch {
      return; // malformed frame — health polling will surface server trouble
    }
    frame ??= requestAnimationFrame(flush);
  };
  source.onopen = () => useEvents.setState({ connected: true });
  source.onerror = () => useEvents.setState({ connected: false });

  return () => {
    if (frame !== null) cancelAnimationFrame(frame);
    source.close();
  };
}
