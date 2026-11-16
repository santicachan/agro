import { describe, expect, it } from "vitest";
import { costPerHa, farmGatePrice, grossMargin, moistureShrink, npkPlan, seedingRate, sprayMix } from "./formulas";
import { CALCULATORS } from "./registry";
import { centsPerBushelToUsdPerTon, convertPrice, convertQuantity } from "@/lib/units";

describe("units", () => {
  it("converts quintales and tonnes", () => {
    expect(convertQuantity(35, "qq", "t")).toBeCloseTo(3.5);
    expect(convertQuantity(1, "t", "saca")).toBeCloseTo(16.6667, 3);
  });
  it("converts CME cents/bu to USD/t", () => {
    // 1226.75 c/bu soybeans ≈ 450.75 USD/t
    expect(centsPerBushelToUsdPerTon(1226.75, "soja")).toBeCloseTo(450.75, 1);
    expect(convertPrice(4, "bu", "t", "maiz")).toBeCloseTo(157.47, 1);
  });
});

describe("grossMargin", () => {
  const r = grossMargin({ yieldQqHa: 35, priceUsdT: 340, commercialPct: 4, freightUsdT: 22, harvestPct: 7, directCostsUsdHa: 280, rentUsdHa: 0 });
  it("computes income and margin", () => {
    expect(r.grossIncome).toBeCloseTo(1190);
    expect(r.netIncome).toBeCloseTo(1190 - 47.6 - 77);
    expect(r.margin).toBeCloseTo(1065.4 - (280 + 83.3));
  });
  it("break-even yield gives zero margin", () => {
    const b = grossMargin({ yieldQqHa: r.breakEvenQqHa, priceUsdT: 340, commercialPct: 4, freightUsdT: 22, harvestPct: 7, directCostsUsdHa: 280, rentUsdHa: 0 });
    expect(b.margin).toBeCloseTo(0, 6);
  });
});

describe("seedingRate", () => {
  it("corrects by germination and emergence", () => {
    const r = seedingRate({ targetPlantsM2: 30, rowSpacingCm: 52.5, thousandSeedWeightG: 160, germinationPct: 100, emergencePct: 100, bagKg: 40 });
    expect(r.seedsHa).toBe(300_000);
    expect(r.kgHa).toBeCloseTo(48);
    expect(r.seedsPerMeter).toBeCloseTo(15.75);
  });
});

describe("moistureShrink", () => {
  it("applies formula plus handling only above base", () => {
    const r = moistureShrink({ grossKg: 10000, moisturePct: 17, baseMoisturePct: 14.5, handlingPct: 0.25 });
    expect(r.shrinkPct).toBeCloseTo((2.5 / 85.5) * 100 + 0.25, 6);
    expect(r.netKg).toBeCloseTo(10000 - r.shrinkKg);
    const dry = moistureShrink({ grossKg: 10000, moisturePct: 13, baseMoisturePct: 14.5, handlingPct: 0.25 });
    expect(dry.shrinkKg).toBe(0);
  });
});

describe("costPerHa", () => {
  it("sums costs and cost per quintal", () => {
    const r = costPerHa({ seed: 60, fertilizer: 40, agrochemicals: 85, sowing: 45, sprayings: 4, sprayCost: 9, harvest: 70, rent: 0, insurance: 8, overhead: 25, hectares: 100, yieldQqHa: 35 });
    expect(r.direct).toBe(336);
    expect(r.total).toBe(369);
    expect(r.costPerQq).toBeCloseTo(369 / 35);
  });
});

describe("npkPlan", () => {
  it("recommends no N for soybean", () => {
    expect(npkPlan({ crop: "soja", targetYieldT: 4, soilNKgHa: 0, soilPBrayPpm: 8, ureaPriceUsdT: 600, mapPriceUsdT: 800 }).ureaKg).toBe(0);
  });
  it("credits N supplied by MAP", () => {
    const r = npkPlan({ crop: "maiz", targetYieldT: 10, soilNKgHa: 70, soilPBrayPpm: 12, ureaPriceUsdT: 600, mapPriceUsdT: 800 });
    expect(r.nToApply).toBe(150);
    expect(r.ureaKg * 0.46 + r.mapKg * 0.11).toBeCloseTo(150);
  });
});

describe("spray & farm gate", () => {
  it("computes tanks", () => {
    const r = sprayMix({ hectares: 80, volumeLHa: 80, tankL: 3000, doseLHa: 2 });
    expect(r.haPerTank).toBeCloseTo(37.5);
    expect(r.productPerTank).toBeCloseTo(75);
  });
  it("computes net price", () => {
    expect(farmGatePrice({ priceUsdT: 300, commissionPct: 2, otherPct: 1, freightUsdT: 20, dryingUsdT: 0 }).net).toBeCloseTo(271);
  });
});

describe("registry", () => {
  it("every calculator computes finite highlight with defaults", () => {
    for (const c of CALCULATORS) {
      const input = Object.fromEntries(c.fields.map((f) => [f.name, f.defaultValue]));
      const res = c.compute(input);
      expect(res.items.length, c.slug).toBeGreaterThan(0);
      expect(Number.isFinite(res.items[0].value), c.slug).toBe(true);
    }
  });
  it("has unique slugs", () => {
    expect(new Set(CALCULATORS.map((c) => c.slug)).size).toBe(CALCULATORS.length);
  });
});
