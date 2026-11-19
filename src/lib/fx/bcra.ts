/**
 * Tipo de cambio oficial del BCRA: Comunicación A 3500 (mayorista de referencia),
 * from the BCRA public API (no key needed):
 *   https://api.bcra.gob.ar/estadisticas/v4.0/Monetarias/5?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 * Fallback: the official USD quote of the "estadísticas cambiarias" API.
 *
 * The rate for a day is the last one published on or before that day (weekends,
 * holidays and today before ~15 h use the previous business day).
 */
export interface BcraRate {
  /** Date of the published rate (YYYY-MM-DD). */
  date: string;
  /** Pesos per USD. */
  rate: number;
}

export const BCRA_SOURCE = "BCRA · Com. A 3500";
const API = "https://api.bcra.gob.ar";

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json", "user-agent": "CAMPAGROX/1.0" }, next: { revalidate: 3600 }, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`BCRA ${res.status}`);
  return res.json();
}

/** Parses the Monetarias (v4) response. */
export function parseMonetarias(json: unknown): BcraRate[] {
  const results = (json as { results?: { detalle?: { fecha: string; valor: number }[] }[] })?.results ?? [];
  return results.flatMap((r) => r.detalle ?? []).filter((d) => d && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha) && Number(d.valor) > 0).map((d) => ({ date: d.fecha, rate: Number(d.valor) }));
}

/** Parses the Cotizaciones/USD response (estadísticas cambiarias v1). */
export function parseCotizaciones(json: unknown): BcraRate[] {
  const results = (json as { results?: { fecha: string; detalle?: { codigoMoneda: string; tipoCotizacion: number }[] }[] })?.results ?? [];
  return results
    .map((r) => ({ date: r.fecha, rate: Number(r.detalle?.find((d) => d.codigoMoneda === "USD")?.tipoCotizacion) }))
    .filter((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date ?? "") && r.rate > 0);
}

/** Every published rate between two dates (inclusive), oldest first. */
export async function fetchBcraRates(from: string, to: string): Promise<BcraRate[]> {
  let rows: BcraRate[] = [];
  try {
    rows = parseMonetarias(await getJson(`${API}/estadisticas/v4.0/Monetarias/5?desde=${from}&hasta=${to}&limit=3000`));
  } catch {
    rows = [];
  }
  if (!rows.length) {
    try {
      rows = parseCotizaciones(await getJson(`${API}/estadisticascambiarias/v1.0/Cotizaciones/USD?fechadesde=${from}&fechahasta=${to}`));
    } catch {
      rows = [];
    }
  }
  return rows.sort((a, b) => a.date.localeCompare(b.date));
}

/** Last published rate on or before `date`. */
export function pickRate(rows: BcraRate[], date: string): BcraRate | null {
  let best: BcraRate | null = null;
  for (const r of rows) if (r.date <= date && (!best || r.date > best.date)) best = r;
  return best;
}

/** Official BCRA rate of a day (or the previous business day). Null if the API is down. */
export async function bcraRateOn(date: string): Promise<BcraRate | null> {
  const today = new Date().toISOString().slice(0, 10);
  const to = date > today ? today : date;
  return pickRate(await fetchBcraRates(addDays(to, -12), to), to);
}
