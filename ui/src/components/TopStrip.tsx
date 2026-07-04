/**
 * Top strip (§3.2): the whole system's health in one ~40px glance line —
 * regime per asset class, session state, risk status, staleness. Values we
 * don't have yet (regime → Phase 2, risk → Phase 5) render as an honest "—",
 * never as a fabricated state.
 */

import { useEffect, useState } from "react";
import { useEvents, useHealth } from "../store.ts";
import { fmtAge } from "../lib/age.ts";

function Dot({ tone }: { tone: "ok" | "warn" | "down" | "none" }) {
  const color = {
    ok: "bg-emerald-500",
    warn: "bg-amber-500",
    down: "bg-red-500",
    none: "bg-zinc-700",
  }[tone];
  return <span className={`inline-block size-1.5 rounded-full ${color}`} />;
}

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function TopStrip() {
  const { snapshot, error, fetchedAtMs } = useHealth();
  const connected = useEvents((s) => s.connected);
  const now = useNow();

  const downCount = snapshot?.adapters.filter((a) => a.state === "down").length ?? 0;
  const healthAge = fetchedAtMs === null ? null : now - fetchedAtMs;
  const healthStale = healthAge !== null && healthAge > 15_000;

  return (
    <header className="flex h-10 items-center gap-5 border-b border-zinc-800 px-4 text-xs">
      <span className="font-semibold tracking-widest text-zinc-100">SENTINEL</span>

      {/* Regime per asset class — engine arrives in Phase 2; no data ≠ a value */}
      <span className="flex items-center gap-1.5 text-zinc-500">
        <Dot tone="none" />
        <Dot tone="none" />
        <Dot tone="none" />
        <span>regime —</span>
      </span>

      <span className="flex items-center gap-1.5">
        <span className="text-zinc-500">NYSE</span>
        <span className="text-zinc-300">{snapshot?.session.NYSE ?? "—"}</span>
        <span className="text-zinc-500">· crypto</span>
        <span className="text-zinc-300">{snapshot ? "24/7" : "—"}</span>
      </span>

      <span className="flex items-center gap-1.5 text-zinc-500">
        <Dot tone="none" />
        <span>risk —</span>
      </span>

      <span className="ml-auto flex items-center gap-4">
        {downCount > 0 && (
          <span className="flex items-center gap-1.5 text-red-400">
            <Dot tone="down" />
            {downCount} adapter{downCount > 1 ? "s" : ""} down
          </span>
        )}
        <span className="flex items-center gap-1.5">
          <Dot tone={connected ? "ok" : "down"} />
          <span className="text-zinc-500">stream</span>
        </span>
        <span
          className={`flex items-center gap-1.5 ${error || healthStale ? "text-red-400" : "text-zinc-500"}`}
          title={error ?? undefined}
        >
          <Dot tone={error ? "down" : healthStale ? "warn" : snapshot ? "ok" : "none"} />
          <span className="num">
            {error
              ? "health unreachable"
              : healthAge === null
                ? "health —"
                : `health ${fmtAge(healthAge)} ago`}
          </span>
        </span>
      </span>
    </header>
  );
}
