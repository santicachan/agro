/**
 * Notas por cheque rechazado (pure): bank fees + exchange difference between the
 * invoice day and the day the cheque was supposed to be collected.
 */
import type { DocType } from "./documents";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ChequeAdjustmentInput {
  side: "venta" | "compra";
  /** Bank fees, net of VAT, in the base currency. */
  fee: number;
  feeVatRate: number;
  /** Amount in pesos to revalue (by default, the cheque amount). VAT included. */
  base: number;
  /** Rate (base currency per USD) of the invoice day. */
  invoiceFx: number;
  /** Rate of the collection day (fecha de cobro). */
  collectionFx: number;
  /** VAT rate contained in the exchange difference (the invoice's rate). */
  diffVatRate: number;
}

export interface AdjustmentLine {
  description: string;
  net: number;
  vatRate: number;
  vat: number;
}

export interface AdjustmentNote {
  type: DocType;
  concept: "diferencia_cambio" | "cheque_rechazado";
  lines: AdjustmentLine[];
  net: number;
  vat: number;
  total: number;
}

/** Exchange difference (VAT included) for `base` pesos invoiced at `invoiceFx` and collected at `collectionFx`. */
export function collectionDifference(base: number, invoiceFx: number, collectionFx: number): number {
  if (!(base > 0) || !(invoiceFx > 0) || !(collectionFx > 0)) return 0;
  return round2((base / invoiceFx) * (collectionFx - invoiceFx));
}

/** Splits a VAT-included amount into net + VAT at `rate`. */
function splitVat(gross: number, rate: number) {
  const net = round2(gross / (1 + rate / 100));
  return { net, vat: round2(gross - net) };
}

/**
 * - Fees (with VAT) and a positive difference go in one Nota de débito.
 * - A negative difference (the peso got stronger) goes in a Nota de crédito; fees, if any, in their own ND.
 */
export function chequeAdjustment(i: ChequeAdjustmentInput): { difference: number; notes: AdjustmentNote[] } {
  const debit: DocType = i.side === "venta" ? "nota_debito_venta" : "nota_debito_compra";
  const credit: DocType = i.side === "venta" ? "nota_credito_venta" : "nota_credito_compra";
  const difference = collectionDifference(i.base, i.invoiceFx, i.collectionFx);
  const feeLine: AdjustmentLine | null =
    i.fee > 0 ? { description: "Gastos bancarios por cheque rechazado", net: round2(i.fee), vatRate: i.feeVatRate, vat: round2((i.fee * i.feeVatRate) / 100) } : null;
  const diffLine: AdjustmentLine | null =
    difference !== 0
      ? (() => {
          const { net, vat } = splitVat(Math.abs(difference), i.diffVatRate);
          return { description: `Diferencia de cambio al día de cobro (TC ${i.invoiceFx} → ${i.collectionFx})`, net, vatRate: i.diffVatRate, vat };
        })()
      : null;

  const note = (type: DocType, concept: AdjustmentNote["concept"], lines: AdjustmentLine[]): AdjustmentNote => {
    const net = round2(lines.reduce((s, l) => s + l.net, 0));
    const vat = round2(lines.reduce((s, l) => s + l.vat, 0));
    return { type, concept, lines, net, vat, total: round2(net + vat) };
  };

  const notes: AdjustmentNote[] = [];
  if (difference > 0) notes.push(note(debit, "diferencia_cambio", [diffLine!, ...(feeLine ? [feeLine] : [])]));
  else {
    if (feeLine) notes.push(note(debit, "cheque_rechazado", [feeLine]));
    if (diffLine) notes.push(note(credit, "diferencia_cambio", [diffLine]));
  }
  return { difference, notes };
}
