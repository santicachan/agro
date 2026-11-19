/**
 * Bolsa de Comercio de Rosario — Cámara Arbitral de Cereales, precios de pizarra.
 * Prices are ARS/t, "entrega inmediata, pago contado, puesto sobre camión en zona Rosario".
 * When there is no trade the board shows "S/C" plus an estimated "(E)" price.
 */
import { parseArNumber } from "@/lib/format";
import { isCrop } from "@/lib/units";
import type { PriceQuote } from "../types";

export const BCR_URL = "https://www.cac.bcr.com.ar/es/precios-de-pizarra";

function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function parseBcrPizarra(html: string): { quotes: PriceQuote[]; fxBuy: number | null; date: string | null } {
  const dateMatch = html.match(/Precios Pizarra del d[ií]a\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
  const date = dateMatch ? toIsoDate(dateMatch[1]) : null;
  const fxMatch = html.match(/TC BNA Divisas<\/strong>[^<]*<strong>\s*\$\s*([\d.,]+)/i);
  const fxBuy = fxMatch ? parseArNumber(fxMatch[1]) : null;

  const quotes: PriceQuote[] = [];
  const boards = html.split(/<div class="board board-/).slice(1);
  for (const chunk of boards) {
    const crop = chunk.match(/^([a-z]+)/)?.[1] ?? "";
    if (!isCrop(crop)) continue;
    const priceBlock = chunk.match(/<div class="price">([\s\S]*?)<\/div>/)?.[1] ?? "";
    const estimated = /S\/C|\(E\)/.test(priceBlock);
    const arsMatch = priceBlock.match(/\$\s*([\d.]+,\d{2})/);
    const ars = arsMatch ? parseArNumber(arsMatch[1]) : Number.NaN;
    const usdMatch = chunk.match(/<strong>US\$<\/strong>[\s\S]*?([\d.]+,\d{2})/);
    const usd = usdMatch ? parseArNumber(usdMatch[1]) : Number.NaN;
    const dir = chunk.match(/fa-arrow-(up|down)/)?.[1] as "up" | "down" | undefined;
    if (!Number.isFinite(ars)) continue;
    quotes.push({
      key: `rosario:${crop}`,
      market: "rosario",
      crop,
      label: `Pizarra Rosario`,
      price: ars,
      currency: "ARS",
      unit: "t",
      usdPerTon: Number.isFinite(usd) ? usd : fxBuy ? ars / fxBuy : null,
      changePct: null,
      direction: dir ?? (/fa-minus|fa-equals/.test(chunk) ? "flat" : null),
      asOf: date ?? new Date().toISOString().slice(0, 10),
      estimated,
      source: "Bolsa de Comercio de Rosario (CAC)",
      sourceUrl: BCR_URL,
    });
  }
  return { quotes, fxBuy, date };
}

export async function fetchBcr(fetchImpl: typeof fetch = fetch) {
  const res = await fetchImpl(BCR_URL, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; CAMPAGROX/1.0)" },
    next: { revalidate: 900 },
  } as RequestInit);
  if (!res.ok) throw new Error(`BCR HTTP ${res.status}`);
  const parsed = parseBcrPizarra(await res.text());
  if (parsed.quotes.length === 0) throw new Error("BCR: no se encontraron precios (¿cambió el HTML?)");
  return parsed;
}
