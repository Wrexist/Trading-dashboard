/**
 * Signals view (§3.2, view 1) — Phase 1 ships the shell with an informative
 * empty state: silence with a reason, backed by real numbers from the event
 * stream, never a fake "all quiet".
 */

import { useEvents, useHealth } from "../store.ts";
import { fmtAge } from "../lib/age.ts";

export function SignalsView() {
  const { events, connected } = useEvents();
  const eventCount = useHealth((s) => s.snapshot?.db.eventCount);
  const newest = events[0];

  return (
    <section className="flex flex-col items-center gap-2 py-24 text-center text-sm">
      <p className="text-zinc-300">No signals.</p>
      <p className="text-zinc-500">
        The ranking engine arrives in Phase 2 — nothing is scored yet.
      </p>
      <p className="text-zinc-500">
        Event stream:{" "}
        <span className="num text-zinc-400">
          {eventCount ?? "—"}
        </span>{" "}
        events stored
        {newest && (
          <>
            {" "}· last{" "}
            <span className="text-zinc-400">{newest.type}</span>{" "}
            <span className="num text-zinc-400">
              {fmtAge(Date.now() - new Date(newest.emittedAt).getTime())} ago
            </span>
          </>
        )}
        {!connected && <span className="text-red-400"> · stream disconnected</span>}
      </p>
      <p className="pt-4 text-xs text-zinc-600">⌘K to navigate</p>
    </section>
  );
}
