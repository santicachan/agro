import type { FxRate } from "../types";

/** USD/ARS mayorista (BCRA Com. A3500) via DolarApi.com and USD/BRL via AwesomeAPI. */
export async function fetchFx(fetchImpl: typeof fetch = fetch): Promise<{ items: FxRate[]; errors: string[] }> {
  const init = { next: { revalidate: 900 } } as RequestInit;
  const [ars, brl] = await Promise.allSettled([
    fetchImpl("https://dolarapi.com/v1/dolares/mayorista", init).then(async (r) => {
      if (!r.ok) throw new Error(`DolarApi HTTP ${r.status}`);
      const j = (await r.json()) as { compra: number; venta: number; fechaActualizacion: string };
      return {
        pair: "USD/ARS",
        label: "Dólar mayorista (A3500)",
        buy: j.compra,
        sell: j.venta,
        asOf: j.fechaActualizacion,
        source: "DolarApi.com",
      } satisfies FxRate;
    }),
    fetchImpl("https://economia.awesomeapi.com.br/json/last/USD-BRL", init).then(async (r) => {
      if (!r.ok) throw new Error(`AwesomeAPI HTTP ${r.status}`);
      const j = (await r.json()) as { USDBRL: { bid: string; ask: string; timestamp: string } };
      return {
        pair: "USD/BRL",
        label: "Dólar comercial (Brasil)",
        buy: Number(j.USDBRL.bid),
        sell: Number(j.USDBRL.ask),
        asOf: new Date(Number(j.USDBRL.timestamp) * 1000).toISOString(),
        source: "AwesomeAPI",
      } satisfies FxRate;
    }),
  ]);
  const items: FxRate[] = [];
  const errors: string[] = [];
  for (const r of [ars, brl]) {
    if (r.status === "fulfilled") items.push(r.value);
    else errors.push(String(r.reason?.message ?? r.reason));
  }
  return { items, errors };
}
