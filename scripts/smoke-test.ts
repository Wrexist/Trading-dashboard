/**
 * SENTINEL Phase 0 smoke test — ROADMAP §2.1 + §4 Phase 0 gate.
 *
 * Hits every data source with REAL keys from .env and prints PASS/FAIL.
 * Hard rule: no mock data, no fallbacks, no silent skips. A missing key or a
 * failing API is a visible FAIL and a non-zero exit code. The Phase 0 gate is
 * "smoke script green on every source" — nothing less.
 *
 * Run: pnpm smoke
 */

import "dotenv/config";
import {
  fetch as ufetch,
  Agent,
  EnvHttpProxyAgent,
  setGlobalDispatcher,
  type Dispatcher,
} from "undici";
import WebSocket from "ws";

// Respect corporate/agent proxies when present (undici's fetch honors the
// dispatcher we set; Node's built-in fetch would not see this one).
if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  setGlobalDispatcher(new EnvHttpProxyAgent());
}

const TIMEOUT_MS = 15_000;

interface CheckResult {
  ok: boolean;
  detail: string;
  ms: number;
}

interface Check {
  name: string;
  /** Env vars that must be non-empty for this check to run. */
  requires: string[];
  run: () => Promise<string>;
}

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

async function getJson(
  url: string,
  init: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    dispatcher?: Dispatcher;
  } = {},
): Promise<any> {
  const res = await ufetch(url, {
    method: init.method ?? "GET",
    headers: init.headers,
    body: init.body,
    dispatcher: init.dispatcher,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  } as any);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 140)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`non-JSON response: ${text.slice(0, 140)}`);
  }
}

const checks: Check[] = [
  {
    name: "Alpaca (stocks bars)",
    requires: ["ALPACA_KEY_ID", "ALPACA_SECRET_KEY"],
    run: async () => {
      const data = await getJson(
        "https://data.alpaca.markets/v2/stocks/bars/latest?symbols=SPY&feed=iex",
        {
          headers: {
            "APCA-API-KEY-ID": env("ALPACA_KEY_ID"),
            "APCA-API-SECRET-KEY": env("ALPACA_SECRET_KEY"),
          },
        },
      );
      const bar = data?.bars?.SPY;
      if (!bar?.t) throw new Error(`no SPY bar in response: ${JSON.stringify(data).slice(0, 140)}`);
      return `latest SPY bar t=${bar.t} c=${bar.c}`;
    },
  },
  {
    name: "IBKR Client Portal Gateway",
    requires: ["IBKR_GATEWAY_URL"],
    run: async () => {
      // Local gateway uses a self-signed cert; trust it for localhost only.
      const insecureLocal = new Agent({ connect: { rejectUnauthorized: false } });
      const data = await getJson(`${env("IBKR_GATEWAY_URL")}/v1/api/tickle`, {
        method: "POST",
        dispatcher: insecureLocal,
      });
      const auth = data?.iserver?.authStatus?.authenticated;
      if (auth !== true) throw new Error(`gateway reachable but not authenticated (authStatus=${JSON.stringify(auth)})`);
      return `gateway session ${String(data.session).slice(0, 8)}…, authenticated`;
    },
  },
  {
    name: "CoinGecko (crypto majors)",
    requires: [],
    run: async () => {
      const key = env("COINGECKO_API_KEY");
      const data = await getJson(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_last_updated_at=true",
        { headers: key ? { "x-cg-demo-api-key": key } : {} },
      );
      const btc = data?.bitcoin;
      if (typeof btc?.usd !== "number") throw new Error(`no BTC price: ${JSON.stringify(data).slice(0, 140)}`);
      return `BTC $${btc.usd} (updated ${new Date(btc.last_updated_at * 1000).toISOString()})${key ? "" : " [no key — anonymous tier]"}`;
    },
  },
  {
    name: "Binance spot REST",
    requires: [],
    run: async () => {
      const data = await getJson("https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT");
      if (!data?.price) throw new Error(`no price: ${JSON.stringify(data).slice(0, 140)}`);
      return `BTCUSDT ${data.price}`;
    },
  },
  {
    name: "Binance WS (streaming)",
    requires: [],
    run: () =>
      new Promise<string>((resolve, reject) => {
        const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@trade");
        const timer = setTimeout(() => {
          ws.terminate();
          reject(new Error(`no trade message within ${TIMEOUT_MS / 1000}s`));
        }, TIMEOUT_MS);
        ws.on("message", (raw) => {
          clearTimeout(timer);
          ws.close();
          try {
            const msg = JSON.parse(raw.toString());
            resolve(`live trade stream ok (BTCUSDT @ ${msg.p ?? "?"})`);
          } catch {
            resolve("live message received");
          }
        });
        ws.on("error", (err) => {
          clearTimeout(timer);
          reject(err);
        });
      }),
  },
  {
    name: "Binance funding rates",
    requires: [],
    run: async () => {
      const data = await getJson("https://fapi.binance.com/fapi/v1/premiumIndex?symbol=BTCUSDT");
      if (data?.lastFundingRate === undefined) {
        throw new Error(`no funding rate: ${JSON.stringify(data).slice(0, 140)}`);
      }
      return `BTCUSDT funding ${data.lastFundingRate}`;
    },
  },
  {
    name: "DexScreener (memecoins)",
    requires: [],
    run: async () => {
      const data = await getJson("https://api.dexscreener.com/latest/dex/search?q=SOL/USDC");
      const n = Array.isArray(data?.pairs) ? data.pairs.length : 0;
      if (n === 0) throw new Error(`no pairs returned: ${JSON.stringify(data).slice(0, 140)}`);
      return `${n} SOL/USDC pairs returned`;
    },
  },
  {
    name: "Birdeye (Solana tokens)",
    requires: ["BIRDEYE_API_KEY"],
    run: async () => {
      const data = await getJson(
        "https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112",
        { headers: { "X-API-KEY": env("BIRDEYE_API_KEY"), "x-chain": "solana" } },
      );
      if (data?.success !== true || typeof data?.data?.value !== "number") {
        throw new Error(`unexpected response: ${JSON.stringify(data).slice(0, 140)}`);
      }
      return `SOL $${data.data.value}`;
    },
  },
  {
    name: "Helius (Solana RPC)",
    requires: ["HELIUS_API_KEY"],
    run: async () => {
      const data = await getJson(`https://mainnet.helius-rpc.com/?api-key=${env("HELIUS_API_KEY")}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getHealth" }),
      });
      if (data?.result !== "ok") throw new Error(`getHealth: ${JSON.stringify(data).slice(0, 140)}`);
      return "RPC healthy";
    },
  },
  {
    name: "RugCheck (token safety)",
    requires: [],
    run: async () => {
      // BONK mint — a long-lived token guaranteed to have a report.
      const data = await getJson(
        "https://api.rugcheck.xyz/v1/tokens/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263/report/summary",
      );
      if (data?.score === undefined) throw new Error(`no score: ${JSON.stringify(data).slice(0, 140)}`);
      return `BONK report score=${data.score}`;
    },
  },
  {
    name: "Finnhub (news/fundamentals)",
    requires: ["FINNHUB_API_KEY"],
    run: async () => {
      const data = await getJson(
        `https://finnhub.io/api/v1/quote?symbol=AAPL&token=${env("FINNHUB_API_KEY")}`,
      );
      if (typeof data?.c !== "number" || data.c === 0 || !data.t) {
        throw new Error(`no AAPL quote: ${JSON.stringify(data).slice(0, 140)}`);
      }
      return `AAPL $${data.c} (t=${new Date(data.t * 1000).toISOString()})`;
    },
  },
  {
    name: "Reddit (mention velocity)",
    requires: ["REDDIT_CLIENT_ID", "REDDIT_CLIENT_SECRET", "REDDIT_USER_AGENT"],
    run: async () => {
      const basic = Buffer.from(`${env("REDDIT_CLIENT_ID")}:${env("REDDIT_CLIENT_SECRET")}`).toString("base64");
      const tok = await getJson("https://www.reddit.com/api/v1/access_token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "content-type": "application/x-www-form-urlencoded",
          "User-Agent": env("REDDIT_USER_AGENT"),
        },
        body: "grant_type=client_credentials",
      });
      if (!tok?.access_token) throw new Error(`no access token: ${JSON.stringify(tok).slice(0, 140)}`);
      const about = await getJson("https://oauth.reddit.com/r/wallstreetbets/about", {
        headers: {
          Authorization: `Bearer ${tok.access_token}`,
          "User-Agent": env("REDDIT_USER_AGENT"),
        },
      });
      const subs = about?.data?.subscribers;
      if (typeof subs !== "number") throw new Error(`no subreddit data: ${JSON.stringify(about).slice(0, 140)}`);
      return `OAuth ok, r/wallstreetbets subscribers=${subs}`;
    },
  },
  {
    name: "FRED (macro)",
    requires: ["FRED_API_KEY"],
    run: async () => {
      const data = await getJson(
        `https://api.stlouisfed.org/fred/series/observations?series_id=DGS10&api_key=${env("FRED_API_KEY")}&file_type=json&sort_order=desc&limit=1`,
      );
      const obs = data?.observations?.[0];
      if (!obs?.date) throw new Error(`no observations: ${JSON.stringify(data).slice(0, 140)}`);
      return `10Y yield ${obs.value} (${obs.date})`;
    },
  },
  {
    name: "ntfy (push alerts)",
    requires: ["NTFY_TOPIC"],
    run: async () => {
      const server = env("NTFY_SERVER") || "https://ntfy.sh";
      const data = await getJson(`${server}/${env("NTFY_TOPIC")}`, {
        method: "POST",
        headers: { Title: "SENTINEL smoke test" },
        body: `Phase 0 smoke test ping — ${new Date().toISOString()}`,
      });
      if (!data?.id) throw new Error(`no message id: ${JSON.stringify(data).slice(0, 140)}`);
      return `test message published (id=${data.id}) — check your phone`;
    },
  },
  {
    name: "Telegram (alerts)",
    requires: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"],
    run: async () => {
      const base = `https://api.telegram.org/bot${env("TELEGRAM_BOT_TOKEN")}`;
      const me = await getJson(`${base}/getMe`);
      if (me?.ok !== true) throw new Error(`getMe failed: ${JSON.stringify(me).slice(0, 140)}`);
      const sent = await getJson(`${base}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          chat_id: env("TELEGRAM_CHAT_ID"),
          text: `SENTINEL Phase 0 smoke test ping — ${new Date().toISOString()}`,
        }),
      });
      if (sent?.ok !== true) throw new Error(`sendMessage failed: ${JSON.stringify(sent).slice(0, 140)}`);
      return `bot @${me.result.username} ok, test message sent — check your phone`;
    },
  },
];

/** Flatten an error and its `cause` chain — "fetch failed" alone is useless in a report. */
function describeError(err: unknown): string {
  const parts: string[] = [];
  let cur: unknown = err;
  while (cur instanceof Error && parts.length < 4) {
    parts.push(cur.message);
    cur = cur.cause;
  }
  if (parts.length === 0) parts.push(String(err));
  return parts.join(" ← ");
}

async function runCheck(check: Check): Promise<CheckResult> {
  const start = Date.now();
  const missing = check.requires.filter((v) => !env(v));
  if (missing.length > 0) {
    return { ok: false, detail: `missing env: ${missing.join(", ")} (fill .env — see .env.example)`, ms: 0 };
  }
  try {
    const detail = await check.run();
    return { ok: true, detail, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, detail: describeError(err), ms: Date.now() - start };
  }
}

const started = new Date().toISOString();
console.log(`SENTINEL Phase 0 smoke test — ${started}`);
console.log(`Sources: ROADMAP §2.1 + ntfy/Telegram (Phase 0 gate). No mocks, no skips.\n`);

const results = await Promise.all(checks.map(runCheck));

const nameWidth = Math.max(...checks.map((c) => c.name.length));
let failures = 0;
results.forEach((r, i) => {
  const check = checks[i]!;
  const status = r.ok ? "PASS" : "FAIL";
  if (!r.ok) failures++;
  console.log(`${status}  ${check.name.padEnd(nameWidth)}  ${r.detail}  (${r.ms}ms)`);
});

console.log(`\n${results.length - failures}/${results.length} sources green.`);
if (failures > 0) {
  console.log(
    "GATE NOT PASSED — fix keys/connectivity for the FAILed sources and re-run. Never substitute mock data for a failing source.",
  );
  process.exit(1);
}
console.log("Phase 0 smoke gate: GREEN on every source.");
