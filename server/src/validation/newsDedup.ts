/**
 * News dedup (§2.2): one canonical item per story. The canonical id is a
 * content hash of the normalized headline + URL host, so the same story
 * re-fetched (or re-syndicated with tracking params) maps to one id.
 * Pure function; storage-level dedup is the news table's PRIMARY KEY.
 */

import { createHash } from "node:crypto";

export function normalizeHeadline(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function urlHost(url: string): string {
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    return "";
  }
}

export function canonicalNewsId(item: { headline: string; url: string }): string {
  const basis = `${normalizeHeadline(item.headline)}|${urlHost(item.url)}`;
  return createHash("sha256").update(basis).digest("hex").slice(0, 24);
}
