/** Commercial document domain logic (pure, framework-agnostic). */

export type DocType =
  | "remito"
  | "factura_venta"
  | "nota_credito_venta"
  | "nota_debito_venta"
  | "factura_compra"
  | "nota_credito_compra"
  | "nota_debito_compra"
  | "recibo"
  | "orden_pago"
  | "canje";

export type Letter = "A" | "B" | "C" | "M" | "E";
export type TaxCondition = "RI" | "MONO" | "EX" | "CF";

export const DOC_TYPES: Record<DocType, { label: string; short: string; side: "venta" | "compra"; fiscal: boolean; payment: boolean }> = {
  remito: { label: "Remito", short: "REM", side: "venta", fiscal: false, payment: false },
  factura_venta: { label: "Factura de venta", short: "FC", side: "venta", fiscal: true, payment: false },
  nota_credito_venta: { label: "Nota de crédito", short: "NC", side: "venta", fiscal: true, payment: false },
  nota_debito_venta: { label: "Nota de débito", short: "ND", side: "venta", fiscal: true, payment: false },
  factura_compra: { label: "Factura de compra", short: "FC-C", side: "compra", fiscal: false, payment: false },
  nota_credito_compra: { label: "NC de proveedor", short: "NC-C", side: "compra", fiscal: false, payment: false },
  nota_debito_compra: { label: "ND de proveedor", short: "ND-C", side: "compra", fiscal: false, payment: false },
  recibo: { label: "Recibo", short: "RC", side: "venta", fiscal: false, payment: true },
  orden_pago: { label: "Orden de pago", short: "OP", side: "compra", fiscal: false, payment: true },
  canje: { label: "Canje de granos", short: "CJ", side: "venta", fiscal: false, payment: false },
};

export const TAX_CONDITIONS: Record<TaxCondition, string> = {
  RI: "Responsable Inscripto",
  MONO: "Monotributista",
  EX: "Exento",
  CF: "Consumidor Final",
};

/**
 * Sign of a document in the party's cuenta corriente.
 * +1 increases what the party owes us (or reduces what we owe them).
 * Mirrors the `account_movements` SQL view.
 */
export function ledgerSign(type: DocType): -1 | 0 | 1 {
  switch (type) {
    case "factura_venta":
    case "nota_debito_venta":
    case "nota_credito_compra":
    case "orden_pago":
      return 1;
    case "nota_credito_venta":
    case "recibo":
    case "factura_compra":
    case "nota_debito_compra":
      return -1;
    default:
      return 0;
  }
}

/** Argentine invoice letter by issuer and receiver tax condition. */
export function invoiceLetter(issuer: TaxCondition, receiver: TaxCondition): Letter {
  if (issuer === "MONO" || issuer === "EX") return "C";
  return receiver === "RI" ? "A" : "B";
}

export function formatDocNumber(pointOfSale: number, number: number | null | undefined): string {
  return `${String(pointOfSale).padStart(5, "0")}-${String(number ?? 0).padStart(8, "0")}`;
}

export interface LineInput {
  description: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export interface Totals {
  net: number;
  vat: number;
  total: number;
  vatByRate: { rate: number; base: number; amount: number }[];
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Totals per line, rounded to cents per line (as ARCA validates).
 * Letter B/C invoices show prices with VAT included, but we always store net + VAT.
 */
export function computeTotals(lines: LineInput[], otherTaxes = 0): Totals {
  const byRate = new Map<number, { base: number; amount: number }>();
  let net = 0;
  let vat = 0;
  for (const l of lines) {
    const lineNet = round2(l.quantity * l.unitPrice);
    const lineVat = round2((lineNet * l.vatRate) / 100);
    net += lineNet;
    vat += lineVat;
    const acc = byRate.get(l.vatRate) ?? { base: 0, amount: 0 };
    acc.base = round2(acc.base + lineNet);
    acc.amount = round2(acc.amount + lineVat);
    byRate.set(l.vatRate, acc);
  }
  return {
    net: round2(net),
    vat: round2(vat),
    total: round2(net + vat + otherTaxes),
    vatByRate: [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, ...v })),
  };
}

/** Running balance for a cuenta corriente listing (oldest first). */
export function runningBalance<T extends { amount: number }>(movements: T[]): (T & { balance: number })[] {
  let balance = 0;
  return movements.map((m) => {
    balance = round2(balance + m.amount);
    return { ...m, balance };
  });
}

// ─────────────────────────────────────────────── Diferencia de cambio
export interface FxDifferenceInput {
  /** Invoice amount in foreign currency (total, VAT included). */
  foreignTotal: number;
  /** Portion of the invoice total that is VAT, in foreign currency. */
  foreignVat: number;
  invoiceFx: number;
  paymentFx: number;
  /** Fraction of the invoice being cancelled by this payment (0–1). */
  appliedFraction?: number;
}

/**
 * When a USD invoice is collected in pesos at a different rate, the difference is
 * billed with a Nota de Débito (rate went up) or Nota de Crédito (rate went down).
 * The VAT share of the difference keeps the invoice's VAT proportion.
 */
export function exchangeDifference(i: FxDifferenceInput) {
  const fraction = i.appliedFraction ?? 1;
  const diffTotal = round2(i.foreignTotal * fraction * (i.paymentFx - i.invoiceFx));
  const vatShare = i.foreignTotal > 0 ? i.foreignVat / i.foreignTotal : 0;
  const vat = round2(diffTotal * vatShare);
  const net = round2(diffTotal - vat);
  const netForeign = i.foreignTotal - i.foreignVat;
  const vatRate = netForeign > 0 ? round2((i.foreignVat / netForeign) * 100) : 0;
  return {
    type: (diffTotal >= 0 ? "nota_debito_venta" : "nota_credito_venta") as DocType,
    net: Math.abs(net),
    vat: Math.abs(vat),
    total: Math.abs(diffTotal),
    vatRate,
    isZero: diffTotal === 0,
  };
}

// ─────────────────────────────────────────────── Canje
/** Tons of grain needed to cancel a debt at an agreed price, with optional discount/premium. */
export function swapTons(debtUsd: number, priceUsdT: number, adjustmentPct = 0): number {
  const price = priceUsdT * (1 + adjustmentPct / 100);
  return price > 0 ? Math.ceil((debtUsd / price) * 1000) / 1000 : Number.NaN;
}
