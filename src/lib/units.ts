/**
 * Grain units and conversions.
 * - quintal (qq) = 100 kg (Argentina)
 * - saca = 60 kg (Brasil)
 * - bushel weight depends on the crop (USDA standard weights).
 */
export type Crop = "soja" | "maiz" | "trigo" | "girasol" | "sorgo" | "cebada";
export type MassUnit = "kg" | "qq" | "t" | "saca" | "bu";

export const CROPS: Record<Crop, { name: string; namePt: string; bushelKg: number; cmeSymbol?: string; color: string }> = {
  soja: { name: "Soja", namePt: "Soja", bushelKg: 27.2155, cmeSymbol: "ZS=F", color: "#65a30d" },
  maiz: { name: "Maíz", namePt: "Milho", bushelKg: 25.4012, cmeSymbol: "ZC=F", color: "#eab308" },
  trigo: { name: "Trigo", namePt: "Trigo", bushelKg: 27.2155, cmeSymbol: "ZW=F", color: "#d97706" },
  girasol: { name: "Girasol", namePt: "Girassol", bushelKg: 13.6078, color: "#f59e0b" },
  sorgo: { name: "Sorgo", namePt: "Sorgo", bushelKg: 25.4012, color: "#b45309" },
  cebada: { name: "Cebada", namePt: "Cevada", bushelKg: 21.7724, color: "#a16207" },
};

export const UNIT_LABEL: Record<MassUnit, string> = {
  kg: "kg",
  qq: "quintal (100 kg)",
  t: "tonelada",
  saca: "saca (60 kg)",
  bu: "bushel",
};

function kgPerUnit(unit: MassUnit, crop: Crop): number {
  switch (unit) {
    case "kg":
      return 1;
    case "qq":
      return 100;
    case "t":
      return 1000;
    case "saca":
      return 60;
    case "bu":
      return CROPS[crop].bushelKg;
  }
}

/** Convert a quantity between mass units. */
export function convertQuantity(value: number, from: MassUnit, to: MassUnit, crop: Crop = "soja"): number {
  return (value * kgPerUnit(from, crop)) / kgPerUnit(to, crop);
}

/** Convert a price expressed per `from` unit to a price per `to` unit. */
export function convertPrice(pricePerUnit: number, from: MassUnit, to: MassUnit, crop: Crop = "soja"): number {
  return (pricePerUnit / kgPerUnit(from, crop)) * kgPerUnit(to, crop);
}

/** CME quotes grains in US cents per bushel. Returns USD per metric ton. */
export function centsPerBushelToUsdPerTon(cents: number, crop: Crop): number {
  return convertPrice(cents / 100, "bu", "t", crop);
}

export function isCrop(value: string): value is Crop {
  return value in CROPS;
}
