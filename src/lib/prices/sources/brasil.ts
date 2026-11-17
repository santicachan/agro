/**
 * Brasil — Indicadores CEPEA/ESALQ (R$ por saca de 60 kg), publicados por
 * Notícias Agrícolas. Soja: Paranaguá. Milho: Campinas.
 */
import { parseArNumber } from "@/lib/format";
import { convertPrice, type Crop } from "@/lib/units";
import type { PriceQuote } from "../types";

const PAGES: { crop: Crop; url: string; titlePrefix: string; label: string }[] = [
  { crop: "soja", url: "https://www.noticiasagricolas.com.br/cotacoes/soja", titlePrefix: "Indicador da Soja", label: "CEPEA/ESALQ Paranaguá" },
  { crop: "maiz", url: "https://www.noticiasagricolas.com.br/cotacoes/milho", titlePrefix: "Indicador do Milho", label: "CEPEA/ESALQ Campinas" },
];

function toIsoDate(ddmmyyyy: string): string {
  const [d, m, y] = ddmmyyyy.split("/");
  return `${y}-${m}-${d}`;
}

export function parseCepeaIndicator(html: string, crop: Crop, titlePrefix: string, label: string, url: string, usdBrl: number | null): PriceQuote {
  const start = html.indexOf(`title="${titlePrefix}`);
  if (start < 0) throw new Error(`Brasil: no se encontró "${titlePrefix}"`);
  const section = html.slice(start, start + 6000);
  const row = section.match(/<td>\s*(\d{2}\/\d{2}\/\d{4})\s*<\/td>\s*<td>\s*([\d.,]+)\s*<\/td>\s*<td>\s*(-?[\d.,]+)%?\s*<\/td>/);
  if (!row) throw new Error("Brasil: fila de precio no encontrada");
  const brlSaca = parseArNumber(row[2]);
  const changePct = parseArNumber(row[3]);
  const usdPerTon = usdBrl ? convertPrice(brlSaca / usdBrl, "saca", "t", crop) : null;
  return {
    key: `brasil:${crop}`,
    market: "brasil",
    crop,
    label,
    price: brlSaca,
    currency: "BRL",
    unit: "saca",
    usdPerTon,
    changePct: Number.isFinite(changePct) ? changePct : null,
    direction: !Number.isFinite(changePct) ? null : changePct > 0 ? "up" : changePct < 0 ? "down" : "flat",
    asOf: toIsoDate(row[1]),
    estimated: false,
    source: "CEPEA/ESALQ (vía Notícias Agrícolas)",
    sourceUrl: url,
  };
}

export async function fetchBrasil(usdBrl: number | null, fetchImpl: typeof fetch = fetch) {
  const results = await Promise.allSettled(
    PAGES.map(async (p) => {
      const res = await fetchImpl(p.url, { headers: { "User-Agent": "Mozilla/5.0 (compatible; AgroJC/1.0)" }, next: { revalidate: 900 } } as RequestInit);
      if (!res.ok) throw new Error(`Brasil ${p.crop} HTTP ${res.status}`);
      return parseCepeaIndicator(await res.text(), p.crop, p.titlePrefix, p.label, p.url, usdBrl);
    }),
  );
  return {
    items: results.flatMap((r) => (r.status === "fulfilled" ? [r.value] : [])),
    errors: results.flatMap((r) => (r.status === "rejected" ? [String(r.reason?.message ?? r.reason)] : [])),
  };
}
