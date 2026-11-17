/**
 * granos.ar public API — pizarra Rosario (Cámara Arbitral de Cereales, via
 * Consiagro) in ARS/t and USD/t, with daily change and history.
 * Docs: https://granos.ar/api-docs/ — free, no key, fair use 60 req/min per IP.
 * Attribution required: "Si publicás estos datos, por favor atribuí a granos.ar".
 */
import { isCrop } from "@/lib/units";
import type { PricePoint, PriceQuote } from "../types";

export const GRANOSAR_API = "https://granosar.lfcaucino.workers.dev/api/v1";
export const GRANOSAR_URL = "https://granos.ar";
/** Prices are refreshed (fetch cache + ISR) every 15 minutes. */
export const PRICE_REFRESH_SECONDS = 900;

interface Envelope<T> {
  meta: { fuente: string; generado_en: string; atribucion?: string };
  data?: T;
  error?: string;
}

interface PizarraData {
  fecha: string;
  tipo_cambio_bna_divisas: number | null;
  granos: Record<string, { ars_tn: number | null; usd_tn: number | null; variacion_pct_vs_rueda_anterior: number | null } | null>;
  fuente_precios?: string;
}

interface HistoricoData {
  unidad: string;
  serie: ({ fecha: string } & Record<string, number | null | string>)[];
}

export function parsePizarra(json: Envelope<PizarraData>): { quotes: PriceQuote[]; fxBuy: number | null; date: string; generatedAt: string } {
  if (!json.data) throw new Error(json.error ?? "granos.ar: respuesta sin datos");
  const d = json.data;
  const source = `granos.ar (${d.fuente_precios ?? "BCR Rosario"})`;
  const quotes: PriceQuote[] = [];
  for (const [crop, g] of Object.entries(d.granos)) {
    if (!isCrop(crop) || !g || g.ars_tn == null) continue;
    const change = g.variacion_pct_vs_rueda_anterior;
    quotes.push({
      key: `rosario:${crop}`,
      market: "rosario",
      crop,
      label: "Pizarra Rosario",
      price: g.ars_tn,
      currency: "ARS",
      unit: "t",
      usdPerTon: g.usd_tn ?? (d.tipo_cambio_bna_divisas ? g.ars_tn / d.tipo_cambio_bna_divisas : null),
      changePct: change ?? null,
      direction: change == null ? null : change > 0 ? "up" : change < 0 ? "down" : "flat",
      asOf: d.fecha,
      // granos.ar does not flag S/C estimated prices.
      estimated: false,
      source,
      sourceUrl: GRANOSAR_URL,
    });
  }
  if (!quotes.length) throw new Error("granos.ar: la pizarra no trajo precios");
  return { quotes, fxBuy: d.tipo_cambio_bna_divisas ?? null, date: d.fecha, generatedAt: json.meta.generado_en };
}

/** Rosario history in ARS/t per crop, oldest first, skipping days without quote. */
export function parseHistorico(json: Envelope<HistoricoData>): Record<string, PricePoint[]> {
  if (!json.data) throw new Error(json.error ?? "granos.ar: histórico sin datos");
  const out: Record<string, PricePoint[]> = {};
  for (const row of json.data.serie) {
    for (const [crop, v] of Object.entries(row)) {
      if (crop === "fecha" || !isCrop(crop) || typeof v !== "number") continue;
      (out[`rosario:${crop}`] ??= []).push({ date: row.fecha, value: v });
    }
  }
  return out;
}

async function get<T>(path: string, fetchImpl: typeof fetch): Promise<Envelope<T>> {
  const res = await fetchImpl(`${GRANOSAR_API}${path}`, {
    headers: { Accept: "application/json", "User-Agent": "AgroJC/1.0 (+https://agrojc.vercel.app)" },
    next: { revalidate: PRICE_REFRESH_SECONDS },
  } as RequestInit);
  if (!res.ok) throw new Error(`granos.ar ${path} HTTP ${res.status}`);
  return (await res.json()) as Envelope<T>;
}

export async function fetchGranosAr(fetchImpl: typeof fetch = fetch) {
  const [pizarra, historico] = await Promise.allSettled([get<PizarraData>("/pizarra", fetchImpl), get<HistoricoData>("/pizarra/historico?dias=90", fetchImpl)]);
  if (pizarra.status === "rejected") throw pizarra.reason;
  const parsed = parsePizarra(pizarra.value);
  let history: Record<string, PricePoint[]> = {};
  try {
    if (historico.status === "fulfilled") history = parseHistorico(historico.value);
  } catch {
    // History is optional: the board still renders today's prices.
  }
  return { ...parsed, history };
}
