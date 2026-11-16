import { CROPS, UNIT_LABEL, convertPrice, convertQuantity, isCrop, type Crop, type MassUnit } from "@/lib/units";
import {
  BASE_MOISTURE,
  HANDLING_LOSS,
  costPerHa,
  farmGatePrice,
  grossMargin,
  moistureShrink,
  npkPlan,
  seedingRate,
  sprayMix,
} from "./formulas";
import { num, str, type CalculatorDef } from "./types";

const cropOptions = (Object.keys(CROPS) as Crop[]).map((c) => ({ value: c, label: CROPS[c].name }));
const unitOptions = (Object.keys(UNIT_LABEL) as MassUnit[]).map((u) => ({ value: u, label: UNIT_LABEL[u] }));
const asCrop = (v: string): Crop => (isCrop(v) ? v : "soja");

export const CALCULATORS: CalculatorDef[] = [
  {
    slug: "margen-bruto",
    title: "Calculadora de margen bruto agrícola",
    shortTitle: "Margen bruto",
    category: "economia",
    description: "Calculá el margen bruto por hectárea de soja, maíz, trigo o girasol, con rinde de indiferencia y retorno sobre costos.",
    seoIntro:
      "El margen bruto es la diferencia entre el ingreso neto y los costos directos de una actividad agrícola. Ingresá tu rinde esperado en quintales, el precio de pizarra en dólares y tus costos para obtener el resultado por hectárea y el rinde de indiferencia (el rinde mínimo para cubrir costos).",
    keywords: ["margen bruto soja", "calculadora margen bruto", "rinde de indiferencia", "margen bruto maíz"],
    fields: [
      { name: "yieldQqHa", label: "Rinde esperado", unit: "qq/ha", defaultValue: 35, min: 0, step: 1, group: "Ingresos" },
      { name: "priceUsdT", label: "Precio", unit: "USD/t", defaultValue: 340, min: 0, step: 1, group: "Ingresos" },
      { name: "commercialPct", label: "Gastos comercialización", unit: "%", defaultValue: 4, min: 0, step: 0.5, group: "Ingresos", help: "Comisiones, sellado, paritarias." },
      { name: "freightUsdT", label: "Flete", unit: "USD/t", defaultValue: 22, min: 0, step: 1, group: "Ingresos" },
      { name: "directCostsUsdHa", label: "Costos directos", unit: "USD/ha", defaultValue: 280, min: 0, step: 5, group: "Costos", help: "Semilla, agroquímicos, fertilizantes y labores." },
      { name: "harvestPct", label: "Cosecha", unit: "% ingreso", defaultValue: 7, min: 0, step: 0.5, group: "Costos" },
      { name: "rentUsdHa", label: "Arrendamiento", unit: "USD/ha", defaultValue: 0, min: 0, step: 5, group: "Costos", help: "Dejá 0 si el campo es propio." },
    ],
    compute: (input) => {
      const r = grossMargin({
        yieldQqHa: num(input, "yieldQqHa"),
        priceUsdT: num(input, "priceUsdT"),
        commercialPct: num(input, "commercialPct"),
        freightUsdT: num(input, "freightUsdT"),
        harvestPct: num(input, "harvestPct"),
        directCostsUsdHa: num(input, "directCostsUsdHa"),
        rentUsdHa: num(input, "rentUsdHa"),
      });
      return {
        items: [
          { label: "Margen bruto", value: r.margin, unit: "USD/ha", highlight: true, tone: "signed" },
          { label: "Rinde de indiferencia", value: r.breakEvenQqHa, unit: "qq/ha", digits: 1 },
          { label: "Retorno sobre costos", value: r.returnPct, unit: "%", digits: 1, tone: "signed" },
          { label: "Ingreso bruto", value: r.grossIncome, unit: "USD/ha" },
          { label: "Ingreso neto", value: r.netIncome, unit: "USD/ha" },
          { label: "Costos totales", value: r.totalCosts, unit: "USD/ha" },
        ],
      };
    },
    faq: [
      { q: "¿Qué es el rinde de indiferencia?", a: "Es el rendimiento mínimo (qq/ha) con el que el ingreso neto cubre exactamente los costos. Por debajo de ese rinde el margen es negativo." },
      { q: "¿El margen bruto incluye impuestos?", a: "No. El margen bruto no descuenta impuestos a las ganancias ni gastos de estructura; para eso usá el resultado neto." },
    ],
  },
  {
    slug: "densidad-de-siembra",
    title: "Calculadora de densidad de siembra",
    shortTitle: "Densidad de siembra",
    category: "siembra",
    description: "Calculá kilos de semilla por hectárea y semillas por metro lineal según plantas objetivo, PMS y poder germinativo.",
    seoIntro:
      "Para lograr el stand de plantas objetivo hay que corregir por poder germinativo y eficiencia de implantación. Con el peso de mil semillas (PMS) obtenés los kilos por hectárea, y con la distancia entre surcos las semillas por metro lineal para regular la sembradora.",
    keywords: ["densidad de siembra soja", "kilos de semilla por hectárea", "semillas por metro lineal", "calculadora siembra maíz"],
    fields: [
      { name: "targetPlantsM2", label: "Plantas objetivo", unit: "pl/m²", defaultValue: 30, min: 0, step: 1 },
      { name: "rowSpacingCm", label: "Distancia entre surcos", unit: "cm", defaultValue: 52.5, min: 0, step: 0.5 },
      { name: "thousandSeedWeightG", label: "Peso de mil semillas (PMS)", unit: "g", defaultValue: 160, min: 0, step: 1 },
      { name: "germinationPct", label: "Poder germinativo", unit: "%", defaultValue: 90, min: 1, max: 100, step: 1 },
      { name: "emergencePct", label: "Eficiencia de implantación", unit: "%", defaultValue: 85, min: 1, max: 100, step: 1 },
      { name: "bagKg", label: "Bolsa", unit: "kg", defaultValue: 40, min: 0, step: 1 },
    ],
    compute: (input) => {
      const r = seedingRate({
        targetPlantsM2: num(input, "targetPlantsM2"),
        rowSpacingCm: num(input, "rowSpacingCm"),
        thousandSeedWeightG: num(input, "thousandSeedWeightG"),
        germinationPct: num(input, "germinationPct"),
        emergencePct: num(input, "emergencePct"),
        bagKg: num(input, "bagKg"),
      });
      return {
        items: [
          { label: "Semilla por hectárea", value: r.kgHa, unit: "kg/ha", highlight: true, digits: 1 },
          { label: "Semillas por metro lineal", value: r.seedsPerMeter, unit: "sem/m", digits: 1 },
          { label: "Semillas a sembrar", value: r.seedsM2, unit: "sem/m²", digits: 1 },
          { label: "Semillas por hectárea", value: r.seedsHa, unit: "sem/ha", digits: 0 },
          { label: "Bolsas por hectárea", value: r.bags, unit: "bolsas/ha", digits: 2 },
        ],
      };
    },
  },
  {
    slug: "merma-por-humedad",
    title: "Calculadora de merma por humedad y secado",
    shortTitle: "Merma por humedad",
    category: "cosecha",
    description: "Calculá la merma por humedad y manipuleo de soja, maíz, trigo y girasol, y el costo de secado.",
    seoIntro:
      "Cuando el grano se entrega con humedad superior a la base de comercialización, el acopio descuenta la merma por secado más un porcentaje de manipuleo. Esta calculadora usa la fórmula de merma (H − Hb) / (100 − Hb) y las bases vigentes en Argentina. Las tablas oficiales de cada cámara pueden diferir levemente.",
    keywords: ["merma por humedad", "merma soja humedad", "tabla merma maíz", "costo de secado"],
    fields: [
      { name: "crop", label: "Cultivo", kind: "select", defaultValue: "maiz", options: cropOptions },
      { name: "grossKg", label: "Peso bruto", unit: "kg", defaultValue: 30000, min: 0, step: 100 },
      { name: "moisturePct", label: "Humedad del grano", unit: "%", defaultValue: 17, min: 0, max: 40, step: 0.1 },
      { name: "baseMoisturePct", label: "Humedad base (0 = automática)", unit: "%", defaultValue: 0, min: 0, max: 30, step: 0.1 },
      { name: "dryingCostPerPointT", label: "Costo de secado", unit: "USD/punto/t", defaultValue: 1.2, min: 0, step: 0.1 },
    ],
    compute: (input) => {
      const crop = asCrop(str(input, "crop"));
      const base = num(input, "baseMoisturePct") || BASE_MOISTURE[crop];
      const r = moistureShrink({
        grossKg: num(input, "grossKg"),
        moisturePct: num(input, "moisturePct"),
        baseMoisturePct: base,
        handlingPct: HANDLING_LOSS[crop],
        dryingCostPerPointT: num(input, "dryingCostPerPointT"),
      });
      return {
        items: [
          { label: "Peso neto", value: r.netKg, unit: "kg", highlight: true, digits: 0 },
          { label: "Merma total", value: r.shrinkPct, unit: "%", digits: 2 },
          { label: "Kilos descontados", value: r.shrinkKg, unit: "kg", digits: 0 },
          { label: "Puntos sobre la base", value: r.excessPoints, unit: "pts", digits: 1 },
          { label: "Costo de secado", value: r.dryingCost, unit: "USD", digits: 2 },
        ],
        notes: [`Humedad base ${base}% · manipuleo ${HANDLING_LOSS[crop]}% (${CROPS[crop].name}).`],
      };
    },
  },
  {
    slug: "costo-por-hectarea",
    title: "Calculadora de costo por hectárea",
    shortTitle: "Costo por hectárea",
    category: "economia",
    description: "Sumá semilla, fertilizantes, agroquímicos, labores y arrendamiento para obtener el costo por hectárea y por quintal.",
    seoIntro:
      "Conocer el costo por hectárea y por quintal producido es clave para decidir qué sembrar y a qué precio vender. Cargá cada rubro en dólares por hectárea.",
    keywords: ["costo por hectárea soja", "costo de producción maíz", "costo por quintal"],
    fields: [
      { name: "seed", label: "Semilla", unit: "USD/ha", defaultValue: 60, min: 0, group: "Insumos" },
      { name: "fertilizer", label: "Fertilizantes", unit: "USD/ha", defaultValue: 40, min: 0, group: "Insumos" },
      { name: "agrochemicals", label: "Agroquímicos", unit: "USD/ha", defaultValue: 85, min: 0, group: "Insumos" },
      { name: "sowing", label: "Siembra", unit: "USD/ha", defaultValue: 45, min: 0, group: "Labores" },
      { name: "sprayings", label: "Pulverizaciones", unit: "aplic.", defaultValue: 4, min: 0, step: 1, group: "Labores" },
      { name: "sprayCost", label: "Costo por pulverización", unit: "USD/ha", defaultValue: 9, min: 0, group: "Labores" },
      { name: "harvest", label: "Cosecha", unit: "USD/ha", defaultValue: 70, min: 0, group: "Labores" },
      { name: "rent", label: "Arrendamiento", unit: "USD/ha", defaultValue: 0, min: 0, group: "Otros" },
      { name: "insurance", label: "Seguro", unit: "USD/ha", defaultValue: 8, min: 0, group: "Otros" },
      { name: "overhead", label: "Estructura", unit: "USD/ha", defaultValue: 25, min: 0, group: "Otros" },
      { name: "hectares", label: "Superficie", unit: "ha", defaultValue: 100, min: 0, group: "Escala" },
      { name: "yieldQqHa", label: "Rinde esperado", unit: "qq/ha", defaultValue: 35, min: 0, group: "Escala" },
    ],
    compute: (input) => {
      const keys = ["seed", "fertilizer", "agrochemicals", "sowing", "sprayings", "sprayCost", "harvest", "rent", "insurance", "overhead", "hectares", "yieldQqHa"] as const;
      const r = costPerHa(Object.fromEntries(keys.map((k) => [k, num(input, k)])) as unknown as Parameters<typeof costPerHa>[0]);
      return {
        items: [
          { label: "Costo total", value: r.total, unit: "USD/ha", highlight: true },
          { label: "Costo por quintal", value: r.costPerQq, unit: "USD/qq" },
          { label: "Costo por tonelada", value: r.costPerT, unit: "USD/t" },
          { label: "Costos directos", value: r.direct, unit: "USD/ha" },
          { label: "Costo total del lote", value: r.totalFarm, unit: "USD", digits: 0 },
        ],
      };
    },
  },
  {
    slug: "fertilizacion-npk",
    title: "Calculadora de fertilización NPK",
    shortTitle: "Fertilización NPK",
    category: "nutricion",
    description: "Estimá kilos de urea y fosfato monoamónico (MAP) por hectárea según rinde objetivo y análisis de suelo.",
    seoIntro:
      "La dosis de fertilizante surge del balance entre la demanda del cultivo para el rinde objetivo y lo que aporta el suelo. Para nitrógeno usamos N-nitratos (0-60 cm); para fósforo, el umbral de P Bray con reposición de lo exportado en grano. Valores orientativos: validalos con tu asesor.",
    keywords: ["calculadora fertilización maíz", "dosis de urea por hectárea", "fósforo bray umbral", "fertilización trigo nitrógeno"],
    fields: [
      { name: "crop", label: "Cultivo", kind: "select", defaultValue: "maiz", options: cropOptions },
      { name: "targetYieldT", label: "Rinde objetivo", unit: "t/ha", defaultValue: 10, min: 0, step: 0.5 },
      { name: "soilNKgHa", label: "N disponible en suelo", unit: "kg N/ha", defaultValue: 70, min: 0, step: 5 },
      { name: "soilPBrayPpm", label: "Fósforo Bray", unit: "ppm", defaultValue: 12, min: 0, step: 0.5 },
      { name: "ureaPriceUsdT", label: "Precio urea", unit: "USD/t", defaultValue: 620, min: 0 },
      { name: "mapPriceUsdT", label: "Precio MAP", unit: "USD/t", defaultValue: 780, min: 0 },
    ],
    compute: (input) => {
      const crop = asCrop(str(input, "crop"));
      const r = npkPlan({
        crop,
        targetYieldT: num(input, "targetYieldT"),
        soilNKgHa: num(input, "soilNKgHa"),
        soilPBrayPpm: num(input, "soilPBrayPpm"),
        ureaPriceUsdT: num(input, "ureaPriceUsdT"),
        mapPriceUsdT: num(input, "mapPriceUsdT"),
      });
      const notes = ["Potasio: los suelos pampeanos suelen tener K suficiente; verificalo con análisis."];
      if (crop === "soja") notes.unshift("La soja fija N biológicamente: no se recomienda N, sí inocular.");
      return {
        items: [
          { label: "Urea (46-0-0)", value: r.ureaKg, unit: "kg/ha", highlight: true, digits: 0 },
          { label: "MAP (11-52-0)", value: r.mapKg, unit: "kg/ha", highlight: true, digits: 0 },
          { label: "Costo de fertilización", value: r.cost, unit: "USD/ha" },
          { label: "N a aplicar", value: r.nToApply, unit: "kg N/ha", digits: 0 },
          { label: "P a aplicar", value: r.pToApply, unit: "kg P/ha", digits: 1 },
          { label: "Demanda total de N", value: r.nDemand, unit: "kg N/ha", digits: 0 },
        ],
        notes,
      };
    },
  },
  {
    slug: "pulverizacion",
    title: "Calculadora de pulverización y caldo",
    shortTitle: "Pulverización",
    category: "aplicacion",
    description: "Calculá cuántos tanques necesitás, hectáreas por tanque y producto a cargar en cada tanque.",
    seoIntro:
      "Antes de salir al lote, calculá el caldo total, la cantidad de tanques y cuánto producto cargar en cada uno según el caudal y la dosis.",
    keywords: ["calculadora pulverización", "cuánto producto por tanque", "caudal litros por hectárea"],
    fields: [
      { name: "hectares", label: "Hectáreas a aplicar", unit: "ha", defaultValue: 80, min: 0 },
      { name: "volumeLHa", label: "Caudal", unit: "L/ha", defaultValue: 80, min: 1 },
      { name: "tankL", label: "Capacidad del tanque", unit: "L", defaultValue: 3000, min: 1, step: 100 },
      { name: "doseLHa", label: "Dosis de producto", unit: "L/ha", defaultValue: 2, min: 0, step: 0.05 },
    ],
    compute: (input) => {
      const r = sprayMix({
        hectares: num(input, "hectares"),
        volumeLHa: num(input, "volumeLHa"),
        tankL: num(input, "tankL"),
        doseLHa: num(input, "doseLHa"),
      });
      return {
        items: [
          { label: "Producto por tanque", value: r.productPerTank, unit: "L", highlight: true, digits: 1 },
          { label: "Tanques necesarios", value: r.tanks, unit: "tanques", digits: 1 },
          { label: "Hectáreas por tanque", value: r.haPerTank, unit: "ha", digits: 1 },
          { label: "Producto total", value: r.totalProduct, unit: "L", digits: 1 },
          { label: "Caldo total", value: r.totalLiquid, unit: "L", digits: 0 },
        ],
      };
    },
  },
  {
    slug: "precio-en-chacra",
    title: "Calculadora de precio neto en chacra",
    shortTitle: "Precio en chacra",
    category: "economia",
    description: "Pasá del precio de pizarra al precio neto que cobrás en el campo descontando comisiones, flete y secado.",
    seoIntro:
      "El precio de pizarra de Rosario es un precio puesto en puerto. Para saber cuánto cobrás realmente hay que descontar comisiones, sellados, flete y secado.",
    keywords: ["precio en chacra soja", "precio neto productor", "descuentos comercialización granos"],
    fields: [
      { name: "priceUsdT", label: "Precio pizarra", unit: "USD/t", defaultValue: 340, min: 0 },
      { name: "commissionPct", label: "Comisión corredor/acopio", unit: "%", defaultValue: 2, min: 0, step: 0.25 },
      { name: "otherPct", label: "Otros gastos (sellado, análisis)", unit: "%", defaultValue: 1.5, min: 0, step: 0.25 },
      { name: "freightUsdT", label: "Flete a puerto", unit: "USD/t", defaultValue: 28, min: 0 },
      { name: "dryingUsdT", label: "Secado/acondicionamiento", unit: "USD/t", defaultValue: 0, min: 0 },
    ],
    compute: (input) => {
      const r = farmGatePrice({
        priceUsdT: num(input, "priceUsdT"),
        commissionPct: num(input, "commissionPct"),
        otherPct: num(input, "otherPct"),
        freightUsdT: num(input, "freightUsdT"),
        dryingUsdT: num(input, "dryingUsdT"),
      });
      return {
        items: [
          { label: "Precio neto en chacra", value: r.net, unit: "USD/t", highlight: true },
          { label: "Precio neto por quintal", value: r.netPerQq, unit: "USD/qq" },
          { label: "Descuento total", value: r.discountPct, unit: "%", digits: 1 },
        ],
      };
    },
  },
  {
    slug: "conversor-de-unidades",
    title: "Conversor de quintales, toneladas, sacas y bushels",
    shortTitle: "Conversor de unidades",
    category: "conversion",
    description: "Convertí cantidades y precios de granos entre kilos, quintales, toneladas, sacas de 60 kg y bushels.",
    seoIntro:
      "En Argentina se habla de quintales y toneladas, en Brasil de sacas de 60 kg y en Chicago de bushels. El peso del bushel depende del grano: 27,216 kg para soja y trigo, 25,401 kg para maíz.",
    keywords: ["quintales a toneladas", "bushel a tonelada soja", "saca a tonelada", "convertir precio bushel"],
    fields: [
      { name: "crop", label: "Grano", kind: "select", defaultValue: "soja", options: cropOptions },
      { name: "value", label: "Valor", defaultValue: 1, min: 0, step: 0.01 },
      { name: "from", label: "Desde", kind: "select", defaultValue: "t", options: unitOptions },
      { name: "to", label: "Hacia", kind: "select", defaultValue: "bu", options: unitOptions },
    ],
    compute: (input) => {
      const crop = asCrop(str(input, "crop"));
      const from = str(input, "from") as MassUnit;
      const to = str(input, "to") as MassUnit;
      const value = num(input, "value");
      return {
        items: [
          { label: `Cantidad en ${UNIT_LABEL[to] ?? to}`, value: convertQuantity(value, from, to, crop), highlight: true, digits: 4 },
          { label: `Precio por ${UNIT_LABEL[to] ?? to} (si el valor es un precio por ${UNIT_LABEL[from] ?? from})`, value: convertPrice(value, from, to, crop), digits: 4 },
        ],
      };
    },
  },
];

export function getCalculator(slug: string): CalculatorDef | undefined {
  return CALCULATORS.find((c) => c.slug === slug);
}
