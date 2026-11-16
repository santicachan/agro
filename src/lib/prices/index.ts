import "server-only";
import { createPublicClient } from "@/lib/supabase/server";
import { fetchBcr } from "./sources/bcr";
import { fetchBrasil } from "./sources/brasil";
import { fetchCme } from "./sources/cme";
import { fetchFx } from "./sources/fx";
import type { PriceBoard, PricePoint, PriceQuote } from "./types";

export * from "./types";

/**
 * Fetches all live sources in parallel. A failing source never breaks the page:
 * its error is reported in `errors` and the rest still render. Rosario history
 * comes from our own daily snapshots (see /api/cron/prices).
 */
export async function getPriceBoard(): Promise<PriceBoard> {
  const errors: PriceBoard["errors"] = [];
  const [fx, bcr, cme] = await Promise.all([
    fetchFx(),
    fetchBcr().catch((e: Error) => {
      errors.push({ source: "BCR Rosario", message: e.message });
      return null;
    }),
    fetchCme(),
  ]);
  fx.errors.forEach((m) => errors.push({ source: "Tipo de cambio", message: m }));
  cme.errors.forEach((m) => errors.push({ source: "CME Chicago", message: m }));

  const usdBrl = fx.items.find((f) => f.pair === "USD/BRL")?.sell ?? null;
  const brasil = await fetchBrasil(usdBrl);
  brasil.errors.forEach((m) => errors.push({ source: "Brasil CEPEA", message: m }));

  const quotes: PriceQuote[] = [...(bcr?.quotes ?? []), ...cme.items.map((i) => i.quote), ...brasil.items];
  const history: Record<string, PricePoint[]> = Object.fromEntries(cme.items.map((i) => [i.quote.key, i.history]));

  const snapshots = await getSnapshots();
  for (const [key, points] of Object.entries(snapshots.history)) {
    if (!history[key]?.length) history[key] = points;
  }
  // If a live source failed, fall back to the latest stored snapshot (flagged as such).
  for (const [key, fallback] of snapshots.latest) {
    if (!quotes.some((q) => q.key === key)) quotes.push(fallback);
  }

  return { quotes, fx: fx.items, history, fetchedAt: new Date().toISOString(), errors };
}

async function getSnapshots(): Promise<{ history: Record<string, PricePoint[]>; latest: Map<string, PriceQuote> }> {
  const latest = new Map<string, PriceQuote>();
  const sb = createPublicClient();
  if (!sb) return { history: {}, latest };
  const since = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const { data, error } = await sb
    .from("price_snapshots")
    .select("key, market, crop, label, price, currency, unit, usd_per_ton, as_of, estimated, source, source_url")
    .gte("as_of", since)
    .order("as_of", { ascending: true });
  if (error || !data) return { history: {}, latest };
  const out: Record<string, PricePoint[]> = {};
  for (const row of data) {
    if (row.usd_per_ton != null) (out[row.key] ??= []).push({ date: row.as_of, value: Number(row.usd_per_ton) });
    latest.set(row.key, {
      key: row.key,
      market: row.market,
      crop: row.crop,
      label: row.label,
      stale: true,
      price: Number(row.price),
      currency: row.currency,
      unit: row.unit,
      usdPerTon: row.usd_per_ton == null ? null : Number(row.usd_per_ton),
      changePct: null,
      direction: null,
      asOf: row.as_of,
      estimated: row.estimated,
      source: row.source,
      sourceUrl: row.source_url,
    });
  }
  return { history: out, latest };
}

export function quotesForCrop(board: PriceBoard, crop: string) {
  return board.quotes.filter((q) => q.crop === crop);
}
