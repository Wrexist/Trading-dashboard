/**
 * Sentry (§2.9). Enabled only when SENTRY_DSN is set; when disabled we say so
 * loudly at boot — the Phase 1 gate requires every failure visible in
 * Health + Sentry, so "quietly not configured" is not an option.
 */

import * as Sentry from "@sentry/node";

let enabled = false;

export function initSentry(): boolean {
  const dsn = (process.env.SENTRY_DSN ?? "").trim();
  if (!dsn) {
    console.warn(
      "[sentry] DISABLED — SENTRY_DSN not set. Phase 1 gate requires Sentry; errors will only reach the console/Health view until configured.",
    );
    return false;
  }
  Sentry.init({ dsn });
  enabled = true;
  console.log("[sentry] enabled");
  return true;
}

export function sentryEnabled(): boolean {
  return enabled;
}

export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  Sentry.captureException(err, { extra: context ?? {} });
}
