/**
 * Pure agronomic / economic formulas. No UI, fully unit-tested.
 * Values are orientative: always validate with a local agronomist.
 */
import type { Crop } from "@/lib/units";

// ---------------------------------------------------------------- Margen bruto
export interface GrossMarginInput {
  yieldQqHa: number; // quintales por hectárea
  priceUsdT: number; // precio pizarra / FAS USD por tonelada
  commercialPct: number; // gastos de comercialización (% del ingreso bruto)
  freightUsdT: number; // flete corto + largo USD/t
  harvestPct: number; // cosecha como % del ingreso bruto
  directCostsUsdHa: number; // semilla + agroquímicos + fertilizantes + labores
  rentUsdHa: number; // arrendamiento
}

export function grossMargin(i: GrossMarginInput) {
  const tons = i.yieldQqHa / 10;
  const grossIncome = tons * i.priceUsdT;
  const commercial = grossIncome * (i.commercialPct / 100) + tons * i.freightUsdT;
  const harvest = grossIncome * (i.harvestPct / 100);
  const netIncome = grossIncome - commercial;
  const totalCosts = i.directCostsUsdHa + harvest + i.rentUsdHa;
  const margin = netIncome - totalCosts;
  // Net price per ton after variable (proportional) costs.
  const netPricePerT = i.priceUsdT * (1 - (i.commercialPct + i.harvestPct) / 100) - i.freightUsdT;
  const breakEvenQqHa = netPricePerT > 0 ? ((i.directCostsUsdHa + i.rentUsdHa) / netPricePerT) * 10 : Number.NaN;
  const returnPct = totalCosts > 0 ? (margin / totalCosts) * 100 : Number.NaN;
  return { grossIncome, commercial, harvest, netIncome, totalCosts, margin, breakEvenQqHa, returnPct };
}

// ------------------------------------------------------------ Densidad siembra
export interface SeedingInput {
  targetPlantsM2: number;
  rowSpacingCm: number;
  thousandSeedWeightG: number; // PMS / P1000
  germinationPct: number; // poder germinativo
  emergencePct: number; // eficiencia de implantación en campo
  bagKg?: number;
}

export function seedingRate(i: SeedingInput) {
  const efficiency = (i.germinationPct / 100) * (i.emergencePct / 100);
  const seedsM2 = efficiency > 0 ? i.targetPlantsM2 / efficiency : Number.NaN;
  const seedsHa = seedsM2 * 10_000;
  const kgHa = (seedsHa * i.thousandSeedWeightG) / 1000 / 1000;
  const seedsPerMeter = seedsM2 * (i.rowSpacingCm / 100);
  const bags = i.bagKg && i.bagKg > 0 ? kgHa / i.bagKg : Number.NaN;
  return { seedsM2, seedsHa, kgHa, seedsPerMeter, bags };
}

// ------------------------------------------------------------ Merma humedad
/** Base moisture (humedad base de comercialización, Argentina). */
export const BASE_MOISTURE: Record<Crop, number> = {
  soja: 13.5,
  maiz: 14.5,
  trigo: 14,
  girasol: 11,
  sorgo: 15,
  cebada: 12.5,
};

/** Merma por manipuleo (handling) usual en Argentina. */
export const HANDLING_LOSS: Record<Crop, number> = {
  soja: 0.25,
  maiz: 0.25,
  trigo: 0.1,
  girasol: 0.2,
  sorgo: 0.25,
  cebada: 0.2,
};

export interface MoistureInput {
  grossKg: number;
  moisturePct: number;
  baseMoisturePct: number;
  handlingPct: number;
  dryingCostPerPointT?: number; // costo de secado por punto y por tonelada
}

export function moistureShrink(i: MoistureInput) {
  const excess = Math.max(0, i.moisturePct - i.baseMoisturePct);
  const waterPct = excess > 0 ? (excess / (100 - i.baseMoisturePct)) * 100 : 0;
  const shrinkPct = waterPct + (excess > 0 ? i.handlingPct : 0);
  const shrinkKg = (i.grossKg * shrinkPct) / 100;
  const netKg = i.grossKg - shrinkKg;
  const dryingCost = (i.dryingCostPerPointT ?? 0) * excess * (i.grossKg / 1000);
  return { excessPoints: excess, shrinkPct, shrinkKg, netKg, dryingCost };
}

// ------------------------------------------------------------ Costo por ha
export interface CostPerHaInput {
  seed: number;
  fertilizer: number;
  agrochemicals: number;
  sowing: number;
  sprayings: number; // número de pulverizaciones
  sprayCost: number; // costo por pulverización
  harvest: number;
  rent: number;
  insurance: number;
  overhead: number; // estructura
  hectares: number;
  yieldQqHa: number;
}

export function costPerHa(i: CostPerHaInput) {
  const direct = i.seed + i.fertilizer + i.agrochemicals + i.sowing + i.sprayings * i.sprayCost + i.harvest;
  const total = direct + i.rent + i.insurance + i.overhead;
  const totalFarm = total * i.hectares;
  const costPerQq = i.yieldQqHa > 0 ? total / i.yieldQqHa : Number.NaN;
  const costPerT = costPerQq * 10;
  return { direct, total, totalFarm, costPerQq, costPerT };
}

// ------------------------------------------------------------ Fertilización NPK
/** Nutrient requirement (kg per tonne of grain) — orientative values (IPNI/INTA). */
export const NUTRIENT_REQ: Record<Crop, { n: number; p: number; k: number; pThresholdPpm: number; fixesN: boolean }> = {
  maiz: { n: 22, p: 4, k: 19, pThresholdPpm: 15, fixesN: false },
  soja: { n: 75, p: 7, k: 33, pThresholdPpm: 12, fixesN: true },
  trigo: { n: 30, p: 5, k: 19, pThresholdPpm: 16, fixesN: false },
  girasol: { n: 40, p: 11, k: 29, pThresholdPpm: 12, fixesN: false },
  sorgo: { n: 30, p: 4, k: 21, pThresholdPpm: 12, fixesN: false },
  cebada: { n: 26, p: 4, k: 18, pThresholdPpm: 15, fixesN: false },
};

export interface NpkInput {
  crop: Crop;
  targetYieldT: number;
  soilNKgHa: number; // N-nitratos 0-60 cm + mineralización estimada
  soilPBrayPpm: number;
  ureaPriceUsdT: number;
  mapPriceUsdT: number;
}

const UREA_N = 0.46;
const MAP_N = 0.11;
const MAP_P = 0.52 * 0.4364; // P2O5 → P

export function npkPlan(i: NpkInput) {
  const req = NUTRIENT_REQ[i.crop];
  const nDemand = req.n * i.targetYieldT;
  // Soybean fixes most of its N biologically; no N fertilizer recommended.
  const nToApply = req.fixesN ? 0 : Math.max(0, nDemand - i.soilNKgHa);
  // P: replace grain export (~75% of uptake) + build-up when below threshold (~3 kg P per ppm).
  const pReplacement = req.p * i.targetYieldT * 0.75;
  const pBuildUp = Math.max(0, req.pThresholdPpm - i.soilPBrayPpm) * 3;
  const pToApply = i.soilPBrayPpm >= req.pThresholdPpm * 1.5 ? 0 : pReplacement + pBuildUp;
  const mapKg = pToApply / MAP_P;
  const nFromMap = mapKg * MAP_N;
  const ureaKg = Math.max(0, nToApply - nFromMap) / UREA_N;
  const cost = (ureaKg / 1000) * i.ureaPriceUsdT + (mapKg / 1000) * i.mapPriceUsdT;
  return { nDemand, nToApply, pToApply, mapKg, ureaKg, cost, kUptake: req.k * i.targetYieldT };
}

// ------------------------------------------------------------ Pulverización
export interface SprayInput {
  hectares: number;
  volumeLHa: number; // caudal
  tankL: number;
  doseLHa: number; // dosis de producto
}

export function sprayMix(i: SprayInput) {
  const totalLiquid = i.hectares * i.volumeLHa;
  const haPerTank = i.volumeLHa > 0 ? i.tankL / i.volumeLHa : Number.NaN;
  const tanks = i.tankL > 0 ? totalLiquid / i.tankL : Number.NaN;
  const productPerTank = haPerTank * i.doseLHa;
  const totalProduct = i.hectares * i.doseLHa;
  return { totalLiquid, haPerTank, tanks, productPerTank, totalProduct };
}

// ------------------------------------------------------------ Precio en chacra
export interface FarmGatePriceInput {
  priceUsdT: number;
  commissionPct: number; // comisión corredor/acopio
  otherPct: number; // sellado, paritarias, análisis
  freightUsdT: number;
  dryingUsdT: number;
}

export function farmGatePrice(i: FarmGatePriceInput) {
  const pct = (i.priceUsdT * (i.commissionPct + i.otherPct)) / 100;
  const net = i.priceUsdT - pct - i.freightUsdT - i.dryingUsdT;
  const netPerQq = net / 10;
  const discountPct = i.priceUsdT > 0 ? ((i.priceUsdT - net) / i.priceUsdT) * 100 : Number.NaN;
  return { net, netPerQq, discountPct };
}
