/**
 * Outbound HTTP for adapters. Honors HTTPS_PROXY (undici EnvHttpProxyAgent —
 * Node's built-in fetch would ignore it). Failures throw with the full cause
 * chain; callers report them to their supervisor — never swallow.
 */

import {
  fetch as ufetch,
  EnvHttpProxyAgent,
  setGlobalDispatcher,
} from "undici";

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

export async function getJson(
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string; timeoutMs?: number } = {},
): Promise<any> {
  const res = await ufetch(url, {
    method: init.method ?? "GET",
    headers: init.headers ?? {},
    body: init.body ?? null,
    signal: AbortSignal.timeout(init.timeoutMs ?? 15_000),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 140)}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 140)}`);
  }
}

/** Flatten an error and its `cause` chain into one readable line. */
export function describeError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  while (cur instanceof Error && parts.length < 4) {
    parts.push(cur.message);
    cur = cur.cause;
  }
  if (parts.length === 0) parts.push(String(err));
  return parts.join(" ← ");
}
