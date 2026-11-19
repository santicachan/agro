/**
 * Liquidación de diferencia de cambio (pure).
 *
 * Invoices are in pesos but priced in dollars: each one stores the BCRA rate of its
 * issue day (usd_rate), so its dollar value is total / usd_rate. Payments (in pesos
 * or in dollars, always converted to pesos at the payment-day rate) cancel pesos;
 * whatever difference the exchange rate leaves stays pending on the account. When
 * the invoice is finally settled, a Nota de débito (the client owes more pesos) or
 * a Nota de crédito (owes fewer) is issued over that differential.
 */
import type { DocType } from "./documents";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface SettlementInput {
  side: "venta" | "compra";
  /** Invoice total in pesos, VAT included. */
  totalArs: number;
  /** Pesos still pending on the invoice. */
  pendingArs: number;
  /** Rate (pesos per USD) of the invoice day. */
  invoiceRate: number;
  /** Dollars already cancelled by earlier payments. */
  usdPaid: number;
  /** Rate of the settlement (payment) day. */
  paymentRate: number;
  /** Net amounts per VAT rate of the invoice, to split the note like the invoice. */
  vatBases: { rate: number; base: number }[];
}

export interface SettlementNoteLine {
  rate: number;
  net: number;
  vat: number;
}

export interface Settlement {
  usdValue: number;
  usdPending: number;
  /** Pesos needed to settle the invoice at the payment-day rate. */
  arsToSettle: number;
  /** arsToSettle − pendingArs: > 0 → ND, < 0 → NC. */
  difference: number;
  note: { type: DocType; lines: SettlementNoteLine[]; net: number; vat: number; total: number } | null;
}

/** Splits a VAT-included amount across the invoice VAT rates; the total is exact. */
export function splitByVat(gross: number, bases: { rate: number; base: number }[]): SettlementNoteLine[] {
  const valid = bases.filter((b) => b.base > 0);
  if (!valid.length) return gross > 0 ? [{ rate: 0, net: r2(gross), vat: 0 }] : [];
  const weights = valid.map((b) => b.base * (1 + b.rate / 100));
  const sum = weights.reduce((s, w) => s + w, 0);
  let left = r2(gross);
  return valid
    .map((b, i) => {
      const g = i === valid.length - 1 ? left : r2((gross * weights[i]) / sum);
      left = r2(left - g);
      const net = r2(g / (1 + b.rate / 100));
      return { rate: b.rate, net, vat: r2(g - net) };
    })
    .filter((l) => l.net + l.vat > 0);
}

export function fxSettlement(i: SettlementInput): Settlement | null {
  if (!(i.invoiceRate > 0) || !(i.paymentRate > 0)) return null;
  const usdValue = i.totalArs / i.invoiceRate;
  const usdPending = Math.max(0, usdValue - i.usdPaid);
  const arsToSettle = r2(usdPending * i.paymentRate);
  const difference = r2(arsToSettle - i.pendingArs);
  let note: Settlement["note"] = null;
  if (Math.abs(difference) >= 0.01) {
    const up = difference > 0;
    const type: DocType = i.side === "venta" ? (up ? "nota_debito_venta" : "nota_credito_venta") : up ? "nota_debito_compra" : "nota_credito_compra";
    const lines = splitByVat(Math.abs(difference), i.vatBases);
    const net = r2(lines.reduce((s, l) => s + l.net, 0));
    const vat = r2(lines.reduce((s, l) => s + l.vat, 0));
    note = { type, lines, net, vat, total: r2(net + vat) };
  }
  return { usdValue: r2(usdValue), usdPending: r2(usdPending), arsToSettle, difference, note };
}

/** Dollars cancelled by a list of applications (pesos applied ÷ rate of each payment). */
export function usdCancelled(apps: { amount: number; paymentRate: number | null }[], invoiceRate: number): number {
  return apps.reduce((s, a) => s + a.amount / (a.paymentRate && a.paymentRate > 0 ? a.paymentRate : invoiceRate), 0);
}
