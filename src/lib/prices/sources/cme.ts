/**
 * CME Group / CBOT front-month futures (soybeans, corn, wheat), via Yahoo Finance
 * public chart endpoint. Quotes are in US cents per bushel (currency "USX").
 * For production use consider a licensed feed (CME DataMine, Barchart, etc.).
 */
import { CROPS, centsPerBushelToUsdPerTon, type Crop } from "@/lib/units";
import type { PricePoint, PriceQuote } from "../types";

const CME_CROPS: Crop[] = ["soja", "maiz", "trigo"];

interface YahooChart {
  chart: {
    result?: {
      meta: { regularMarketPrice: number; chartPreviousClose?: number; previousClose?: number; regularMarketTime: number; currency: string };
      timestamp?: number[];
      indicators: { quote: { close: (number | null)[] }[] };
    }[];
    error?: { description: string } | null;
  };
}

export function parseYahooChart(json: YahooChart, crop: Crop): { quote: PriceQuote; history: PricePoint[] } {
  const r = json.chart.result?.[0];
  if (!r) throw new Error(json.chart.error?.description ?? "Yahoo: sin datos");
  const cents = r.meta.regularMarketPrice;
  const closes = r.indicators.quote[0]?.close ?? [];
  const history: PricePoint[] = (r.timestamp ?? [])
    .map((t, i) => ({ date: new Date(t * 1000).toISOString().slice(0, 10), value: closes[i] }))
    .filter((p): p is PricePoint => typeof p.value === "number")
    .map((p) => ({ date: p.date, value: Math.round(centsPerBushelToUsdPerTon(p.value, crop) * 100) / 100 }));
  // Previous close = second to last daily close (chartPreviousClose refers to the range start).
  const prev = closes.filter((c): c is number => typeof c === "number").at(-2) ?? r.meta.previousClose;
  const changePct = prev ? ((cents - prev) / prev) * 100 : null;
  return {
    quote: {
      key: `cme:${crop}`,
      market: "cme",
      crop,
      label: "CBOT Chicago (1ª posición)",
      price: cents / 100,
      currency: "USD",
      unit: "bu",
      usdPerTon: centsPerBushelToUsdPerTon(cents, crop),
      changePct,
      direction: changePct == null ? null : changePct > 0 ? "up" : changePct < 0 ? "down" : "flat",
      asOf: new Date(r.meta.regularMarketTime * 1000).toISOString().slice(0, 10),
      estimated: false,
      source: "CME Group / CBOT (vía Yahoo Finance)",
      sourceUrl: "https://www.cmegroup.com/markets/agriculture.html",
    },
    history,
  };
}

export async function fetchCme(fetchImpl: typeof fetch = fetch) {
  const results = await Promise.allSettled(
    CME_CROPS.map(async (crop) => {
      const symbol = CROPS[crop].cmeSymbol!;
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=3mo`;
      const res = await fetchImpl(url, { headers: { "User-Agent": "Mozilla/5.0" }, next: { revalidate: 900 } } as RequestInit);
      if (!res.ok) throw new Error(`CME ${symbol} HTTP ${res.status}`);
      return parseYahooChart((await res.json()) as YahooChart, crop);
    }),
  );
  const ok = results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const errors = results.flatMap((r) => (r.status === "rejected" ? [String(r.reason?.message ?? r.reason)] : []));
  return { items: ok, errors };
}
