/**
 * CoinGecko adapter (§2.1): budgeted polling of crypto-major spot prices.
 * Emits QuoteTick snapshots (no bid/ask — CoinGecko has none and we never
 * fabricate). Free tier: 30 req/min; we poll once per minute.
 */

import type { EventBus } from "../bus.ts";
import { getJson } from "../http.ts";
import { PollingAdapter, Supervisor } from "./framework.ts";

const COINS: Array<{ id: string; symbol: string }> = [
  { id: "bitcoin", symbol: "BTC" },
  { id: "ethereum", symbol: "ETH" },
  { id: "solana", symbol: "SOL" },
];

export class CoinGeckoAdapter extends PollingAdapter {
  readonly source = "coingecko" as const;
  #bus: EventBus;

  constructor(bus: EventBus) {
    super(new Supervisor(bus, "coingecko", 20), 60_000);
    this.#bus = bus;
  }

  protected override async poll(): Promise<string> {
    const key = (process.env.COINGECKO_API_KEY ?? "").trim();
    const ids = COINS.map((c) => c.id).join(",");
    const data = await getJson(
      `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_last_updated_at=true`,
      { headers: key ? { "x-cg-demo-api-key": key } : {} },
    );

    const fetchedAt = new Date();
    let published = 0;
    for (const coin of COINS) {
      const entry = data?.[coin.id];
      if (typeof entry?.usd !== "number" || typeof entry?.last_updated_at !== "number") {
        throw new Error(`no usable price for ${coin.id}: ${JSON.stringify(entry).slice(0, 100)}`);
      }
      const tickAt = new Date(entry.last_updated_at * 1000);
      this.#bus.publish({
        type: "QuoteTick",
        symbol: coin.symbol,
        assetClass: "crypto",
        last: entry.usd,
        tickAt: tickAt.toISOString(),
        provenance: {
          source: "coingecko",
          fetchedAt: fetchedAt.toISOString(),
          stalenessMs: fetchedAt.getTime() - tickAt.getTime(),
        },
      });
      published++;
    }
    return `polled ${published} crypto majors (BTC $${data.bitcoin.usd})`;
  }
}
