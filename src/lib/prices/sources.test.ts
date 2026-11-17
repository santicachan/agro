import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseBcrPizarra } from "./sources/bcr";
import { parseCepeaIndicator } from "./sources/brasil";
import { parseYahooChart } from "./sources/cme";

const fixture = (name: string) => readFileSync(join(__dirname, "..", "__fixtures__", name), "utf8");

describe("BCR pizarra parser", () => {
  const r = parseBcrPizarra(fixture("bcr-pizarra.html"));
  it("reads date and FX", () => {
    expect(r.date).toBe("2026-11-13");
    expect(r.fxBuy).toBeCloseTo(1534.5);
  });
  it("reads soja (traded) and maíz (estimated)", () => {
    const soja = r.quotes.find((q) => q.crop === "soja")!;
    expect(soja.price).toBe(545000);
    expect(soja.estimated).toBe(false);
    const maiz = r.quotes.find((q) => q.crop === "maiz")!;
    expect(maiz.price).toBe(269300);
    expect(maiz.estimated).toBe(true);
    expect(maiz.usdPerTon).toBeCloseTo(175.5);
    expect(r.quotes.map((q) => q.crop).sort()).toEqual(["girasol", "maiz", "soja", "sorgo", "trigo"]);
  });
});

describe("CEPEA parser", () => {
  it("reads R$/saca and converts to USD/t", () => {
    const q = parseCepeaIndicator(fixture("na-soja.html"), "soja", "Indicador da Soja", "Paranaguá", "x", 5.78);
    expect(q.price).toBeCloseTo(166.07);
    expect(q.changePct).toBeCloseTo(0.96);
    expect(q.asOf).toBe("2026-11-16");
    expect(q.usdPerTon).toBeCloseTo((166.07 / 5.78) * (1000 / 60), 2);
  });
});

describe("Yahoo/CME parser", () => {
  it("converts cents per bushel", () => {
    const { quote, history } = parseYahooChart(
      {
        chart: {
          result: [
            {
              meta: { regularMarketPrice: 1226.75, regularMarketTime: 1794856798, currency: "USX" },
              timestamp: [1794700000, 1794786400, 1794856798],
              indicators: { quote: [{ close: [1220, 1229, 1226.75] }] },
            },
          ],
        },
      },
      "soja",
    );
    expect(quote.price).toBeCloseTo(12.2675);
    expect(quote.usdPerTon).toBeCloseTo(450.75, 1);
    expect(quote.changePct).toBeCloseTo(((1226.75 - 1229) / 1229) * 100);
    expect(history).toHaveLength(3);
  });
});

describe("granos.ar API parser", () => {
  const pizarra = JSON.parse(fixture("granosar-pizarra.json"));
  const historico = JSON.parse(fixture("granosar-historico.json"));
  it("reads Rosario prices in ARS and USD with daily change", async () => {
    const { parsePizarra } = await import("./sources/granosar");
    const r = parsePizarra(pizarra);
    expect(r.date).toBe("2026-11-13");
    expect(r.fxBuy).toBe(1542);
    expect(r.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const soja = r.quotes.find((q) => q.crop === "soja")!;
    expect(soja).toMatchObject({ key: "rosario:soja", price: 545000, usdPerTon: 353.44, changePct: 0.93, direction: "up", currency: "ARS", sourceUrl: "https://granos.ar" });
    expect(soja.source).toContain("granos.ar");
    expect(r.quotes.map((q) => q.crop).sort()).toEqual(["girasol", "maiz", "soja", "sorgo", "trigo"]);
  });
  it("reads ARS history per crop, oldest first", async () => {
    const { parseHistorico } = await import("./sources/granosar");
    const h = parseHistorico(historico);
    expect(h["rosario:soja"]).toHaveLength(10);
    expect(h["rosario:soja"][0].date < h["rosario:soja"][9].date).toBe(true);
    expect(h["rosario:soja"].at(-1)).toEqual({ date: "2026-11-13", value: 545000 });
  });
  it("fails loudly on an error envelope so the BCR fallback kicks in", async () => {
    const { parsePizarra } = await import("./sources/granosar");
    expect(() => parsePizarra({ meta: { fuente: "granos.ar", generado_en: "x" }, error: "Servicio no disponible" })).toThrow("Servicio no disponible");
  });
});
