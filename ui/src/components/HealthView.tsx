/**
 * Health view (§3.2, view 5): adapter list, budgets, DB size, Sentry.
 * Every value is shown with its age; failures are the loudest thing here.
 */

import type { AdapterHealth } from "@sentinel/shared/contracts";
import { useHealth } from "../store.ts";
import { fmtAge, fmtBytes } from "../lib/age.ts";

function StateBadge({ state }: { state: AdapterHealth["state"] }) {
  const tone = {
    ok: "bg-emerald-950 text-emerald-400",
    starting: "bg-amber-950 text-amber-400",
    down: "bg-red-950 text-red-400",
  }[state];
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium uppercase ${tone}`}>
      {state}
    </span>
  );
}

export function HealthView() {
  const { snapshot, error, fetchedAtMs } = useHealth();

  if (error) {
    return (
      <section className="py-24 text-center text-sm">
        <p className="text-red-400">Health endpoint unreachable: {error}</p>
        <p className="pt-2 text-zinc-500">Is the server running? `pnpm --filter @sentinel/server dev`</p>
      </section>
    );
  }
  if (!snapshot) {
    return <section className="py-24 text-center text-sm text-zinc-500">Loading health…</section>;
  }

  const now = Date.now();
  return (
    <section className="flex flex-col gap-6 py-6 text-sm">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-zinc-800 text-xs text-zinc-500">
            <th className="py-2 pr-3 font-normal">adapter</th>
            <th className="py-2 pr-3 font-normal">state</th>
            <th className="py-2 pr-3 font-normal">detail</th>
            <th className="py-2 pr-3 font-normal">last ok</th>
            <th className="py-2 pr-3 font-normal">fails</th>
            <th className="py-2 font-normal">budget /min</th>
          </tr>
        </thead>
        <tbody>
          {snapshot.adapters.map((a) => (
            <tr key={a.source} className="border-b border-zinc-900 align-top">
              <td className="py-2 pr-3 text-zinc-200">{a.source}</td>
              <td className="py-2 pr-3">
                <StateBadge state={a.state} />
              </td>
              <td className="max-w-md py-2 pr-3 text-zinc-400">
                {a.detail}
                {a.circuitOpenUntil && (
                  <span className="text-zinc-600">
                    {" "}· retry in{" "}
                    <span className="num">
                      {fmtAge(new Date(a.circuitOpenUntil).getTime() - now)}
                    </span>
                  </span>
                )}
              </td>
              <td className="num py-2 pr-3 text-zinc-400">
                {a.lastOkAt ? `${fmtAge(now - new Date(a.lastOkAt).getTime())} ago` : "never"}
              </td>
              <td className="num py-2 pr-3 text-zinc-400">{a.consecutiveFailures}</td>
              <td className="num py-2 text-zinc-400">
                {a.budget.usedLastMinute}/{a.budget.maxPerMinute}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex flex-wrap gap-x-8 gap-y-1 text-xs text-zinc-500">
        <span>
          db <span className="num text-zinc-400">{fmtBytes(snapshot.db.sizeBytes)}</span>
        </span>
        <span>
          events <span className="num text-zinc-400">{snapshot.db.eventCount}</span>
        </span>
        <span>
          bars <span className="num text-zinc-400">{snapshot.db.barCount}</span>
        </span>
        <span>
          news <span className="num text-zinc-400">{snapshot.db.newsCount}</span>
        </span>
        <span>
          sentry{" "}
          <span className={snapshot.sentryEnabled ? "text-emerald-400" : "text-red-400"}>
            {snapshot.sentryEnabled ? "enabled" : "DISABLED (set SENTRY_DSN)"}
          </span>
        </span>
        <span>
          uptime{" "}
          <span className="num text-zinc-400">
            {fmtAge(now - new Date(snapshot.startedAt).getTime())}
          </span>
        </span>
        {fetchedAtMs !== null && (
          <span>
            snapshot <span className="num text-zinc-400">{fmtAge(now - fetchedAtMs)} ago</span>
          </span>
        )}
      </div>
    </section>
  );
}
