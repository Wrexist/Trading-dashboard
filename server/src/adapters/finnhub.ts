/**
 * Finnhub news adapter (§2.1): budgeted polling of general market news.
 * Dedup happens twice, deliberately: canonical-id hashing (validation layer)
 * and the news table PRIMARY KEY — only genuinely new stories publish
 * NewsArrived. Free tier: 60 req/min; we poll every 2 minutes.
 */

import type { EventBus } from "../bus.ts";
import type { Db } from "../db.ts";
import { getJson } from "../http.ts";
import { canonicalNewsId } from "../validation/newsDedup.ts";
import { PollingAdapter, Supervisor } from "./framework.ts";

export class FinnhubNewsAdapter extends PollingAdapter {
  readonly source = "finnhub" as const;
  #bus: EventBus;
  #insertNews;

  constructor(bus: EventBus, db: Db) {
    super(new Supervisor(bus, "finnhub", 30), 120_000);
    this.#bus = bus;
    this.#insertNews = db.prepare(
      `INSERT OR IGNORE INTO news
       (canonical_id, headline, url, symbols, published_at, source, fetched_at)
       VALUES (?, ?, ?, ?, ?, 'finnhub', ?)`,
    );
  }

  protected override missingConfig(): string | null {
    return (process.env.FINNHUB_API_KEY ?? "").trim()
      ? null
      : "missing env FINNHUB_API_KEY (fill .env, see .env.example)";
  }

  protected override async poll(): Promise<string> {
    const token = (process.env.FINNHUB_API_KEY ?? "").trim();
    const items = await getJson(
      `https://finnhub.io/api/v1/news?category=general&token=${token}`,
    );
    if (!Array.isArray(items)) {
      throw new Error(`expected news array, got: ${JSON.stringify(items).slice(0, 100)}`);
    }

    const fetchedAt = new Date();
    let fresh = 0;
    for (const item of items) {
      if (!item?.headline || !item?.url || !item?.datetime) continue;
      const canonicalId = canonicalNewsId({ headline: item.headline, url: item.url });
      const publishedAt = new Date(item.datetime * 1000).toISOString();
      const symbols =
        typeof item.related === "string" && item.related.length > 0
          ? item.related.split(",").filter(Boolean)
          : [];

      const inserted = this.#insertNews.run(
        canonicalId,
        item.headline,
        item.url,
        JSON.stringify(symbols),
        publishedAt,
        fetchedAt.toISOString(),
      );
      if (Number(inserted.changes) === 0) continue; // duplicate — one canonical item per story

      this.#bus.publish({
        type: "NewsArrived",
        canonicalId,
        headline: item.headline,
        url: item.url,
        symbols,
        publishedAt,
        provenance: {
          source: "finnhub",
          fetchedAt: fetchedAt.toISOString(),
          stalenessMs: fetchedAt.getTime() - item.datetime * 1000,
        },
      });
      fresh++;
    }
    return `polled ${items.length} stories, ${fresh} new after dedup`;
  }
}
