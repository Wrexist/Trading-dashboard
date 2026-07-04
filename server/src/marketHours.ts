/**
 * Market-hours module (§2.1): sessionState(exchange, at) — pure, UTC in,
 * no I/O. US equity sessions are computed in America/New_York local time via
 * Intl, so DST is handled by the timezone database, not by us.
 */

import type { SessionState } from "@sentinel/shared/contracts";

export type Exchange = "NYSE" | "NASDAQ" | "CRYPTO";

/**
 * NYSE full-closure holidays 2026.
 * Source: NYSE published calendar (verify against nyse.com/markets/hours-calendars
 * before relying on it near a holiday). Early-close half days (e.g. day after
 * Thanksgiving, Christmas Eve) are NOT modeled yet — they report "regular".
 */
const NYSE_HOLIDAYS_2026 = new Set([
  "2026-01-01", // New Year's Day
  "2026-01-19", // Martin Luther King Jr. Day
  "2026-02-16", // Washington's Birthday
  "2026-04-03", // Good Friday
  "2026-05-25", // Memorial Day
  "2026-06-19", // Juneteenth
  "2026-07-03", // Independence Day (observed — Jul 4 falls on Saturday)
  "2026-09-07", // Labor Day
  "2026-11-26", // Thanksgiving
  "2026-12-25", // Christmas
]);

interface NyLocalTime {
  date: string; // YYYY-MM-DD in New York
  weekday: string; // "Mon".."Sun"
  minutes: number; // minutes since New York midnight
}

function newYorkLocalTime(at: Date): NyLocalTime {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  // Intl may render midnight as "24" with hour12:false.
  const hour = Number(get("hour")) % 24;
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    weekday: get("weekday"),
    minutes: hour * 60 + Number(get("minute")),
  };
}

const MIN = (h: number, m: number) => h * 60 + m;

/**
 * US equities: premarket 04:00–09:30, regular 09:30–16:00,
 * afterhours 16:00–20:00, otherwise closed. Weekends + holidays closed.
 */
export function sessionState(exchange: Exchange, at: Date): SessionState {
  if (exchange === "CRYPTO") return "open24h";

  const ny = newYorkLocalTime(at);
  if (ny.weekday === "Sat" || ny.weekday === "Sun") return "closed";
  if (NYSE_HOLIDAYS_2026.has(ny.date)) return "closed";

  const m = ny.minutes;
  if (m >= MIN(4, 0) && m < MIN(9, 30)) return "premarket";
  if (m >= MIN(9, 30) && m < MIN(16, 0)) return "regular";
  if (m >= MIN(16, 0) && m < MIN(20, 0)) return "afterhours";
  return "closed";
}
