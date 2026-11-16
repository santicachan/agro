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
