/**
 * Pure builders for the `create_document` RPC. Shared by the server actions and
 * the demo seed script so both produce exactly the same documents.
 */
import { DOC_TYPES, computeTotals, exchangeDifferenceByRate, invoiceLetter, type DocType, type LineInput, type TaxCondition } from "./documents";
import { fxSettlement } from "./fx-settlement";
import { ledgerLetter, type Ledger } from "./ledger";

export interface OrgInfo {
  id: string;
  base_currency: string;
  tax_condition: TaxCondition | null;
  arca_config?: { pointOfSale?: number } | null;
}

export interface PartyInfo {
  id: string;
  tax_condition: TaxCondition | null;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function defaultPointOfSale(org: OrgInfo) {
  return Number(org.arca_config?.pointOfSale) || 1;
}

/**
 * Letter: sales use our condition as issuer; purchases use the supplier as issuer.
 * In the Gestión ledger every invoice/note is a "Factura X" (letter X).
 */
export function letterFor(type: DocType, org: OrgInfo, party: PartyInfo, ledger: Ledger = "blanco") {
  const meta = DOC_TYPES[type];
  if (meta.payment || type === "remito" || type === "canje") return null;
  const orgCond = (org.tax_condition ?? "RI") as TaxCondition;
  const partyCond = (party.tax_condition ?? "CF") as TaxCondition;
  const fiscal = meta.side === "venta" ? invoiceLetter(orgCond, partyCond) : invoiceLetter(partyCond === "CF" ? "MONO" : partyCond, orgCond);
  return ledgerLetter(ledger, fiscal);
}

export function linesToRpc(lines: (LineInput & { unit?: string; productId?: string | null })[]) {
  return lines.map((l) => {
    const net = r2(l.quantity * l.unitPrice);
    return {
      product_id: l.productId ?? null,
      description: l.description,
      quantity: l.quantity,
      unit: l.unit ?? "u",
      unit_price: l.unitPrice,
      vat_rate: l.vatRate,
      net,
      vat: r2((net * l.vatRate) / 100),
    };
  });
}

export interface DocumentInput {
  type: DocType;
  issueDate: string;
  dueDate?: string | null;
  currency: string;
  fxRate: number;
  pointOfSale?: number;
  /** Supplier's own number for purchase documents. Sales are numbered automatically. */
  number?: number | null;
  otherTaxes?: number;
  notes?: string | null;
  sourceDocumentId?: string | null;
  lines: (LineInput & { unit?: string; productId?: string | null })[];
  /** For NC: cancel this amount (in the source invoice currency) of the source invoice. */
  applyToSource?: number | null;
  /** Blanco (formal) or Gestión (internal, Factura X). */
  ledger?: Ledger;
  /** Base currency per USD on the issue day, to show the account in dollars. */
  usdRate?: number | null;
  /** Official BCRA rate (Com. A 3500) of the issue day and the date it was published. */
  bcra?: { rate: number; date: string } | null;
}

export function buildDocumentRpc(org: OrgInfo, party: PartyInfo, d: DocumentInput) {
  const totals = computeTotals(d.lines, d.otherTaxes ?? 0);
  const foreign = d.currency !== org.base_currency;
  const ledger = d.ledger ?? "blanco";
  return {
    p_doc: {
      org_id: org.id,
      party_id: party.id,
      type: d.type,
      ledger,
      letter: letterFor(d.type, org, party, ledger),
      point_of_sale: d.pointOfSale ?? (DOC_TYPES[d.type].side === "compra" ? 1 : defaultPointOfSale(org)),
      number: DOC_TYPES[d.type].side === "compra" ? (d.number ?? null) : null,
      issue_date: d.issueDate,
      due_date: d.dueDate ?? null,
      currency: d.currency,
      fx_rate: foreign ? d.fxRate : 1,
      net: totals.net,
      vat: totals.vat,
      other_taxes: d.otherTaxes ?? 0,
      total: totals.total,
      status: "issued",
      source_document_id: d.sourceDocumentId ?? null,
      notes: d.notes ?? null,
      usd_rate: d.currency === "USD" ? d.fxRate : d.usdRate && d.usdRate > 0 ? d.usdRate : (d.bcra?.rate ?? null),
      bcra_rate: d.bcra?.rate ?? null,
      bcra_rate_date: d.bcra?.date ?? null,
    },
    p_lines: linesToRpc(d.lines),
    p_payments: [],
    p_applications:
      d.sourceDocumentId && d.applyToSource && d.applyToSource > 0
        ? [{ invoice_document_id: d.sourceDocumentId, amount: r2(d.applyToSource), fx_rate: 1 }]
        : [],
    p_fx_notes: [],
  };
}

export interface InvoiceForPayment {
  id: string;
  type: DocType;
  letter: string | null;
  point_of_sale: number;
  number: number;
  currency: string;
  fx_rate: number;
  total: number;
  lines: { vat_rate: number; net: number }[];
  /** Pesos per USD of the invoice day (peso invoices priced in dollars). */
  usd_rate?: number | null;
  /** Pending in the invoice currency (needed to settle). */
  pending?: number | null;
  /** Dollars already cancelled by earlier payments. */
  usd_paid?: number | null;
}

export const PAYMENT_METHODS = ["transferencia", "efectivo", "cheque", "echeq", "retencion", "granos", "insumo", "vehiculo"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  transferencia: "Transferencia",
  efectivo: "Efectivo",
  cheque: "Cheque",
  echeq: "eCheq",
  retencion: "Retención",
  granos: "Granos (canje)",
  insumo: "Insumo",
  vehiculo: "Vehículo",
};

export interface PaymentItemInput {
  method: PaymentMethod;
  amount: number;
  reference?: string | null;
  chequeId?: string | null;
  cheque?: { bank: string; number: string; drawerName?: string | null; drawerTaxId?: string | null; paymentDate: string } | null;
}

export interface PaymentInput {
  type: "recibo" | "orden_pago";
  issueDate: string;
  /** Base currency per USD on the payment day (BCRA by default). */
  fxRate: number;
  /**
   * Currency the items are received/paid in. Dollars are converted to pesos at
   * `fxRate`: the receipt / payment order is always in the base currency.
   */
  currency?: string;
  ledger?: Ledger;
  notes?: string | null;
  items: PaymentItemInput[];
  /**
   * amount: pesos applied (or the invoice currency for legacy USD invoices).
   * settle: cancel the invoice's dollar value at `fxRate` and issue the ND/NC
   * for the exchange difference (amount is then computed here).
   */
  applications: { invoiceId: string; amount: number; settle?: boolean }[];
  autoFxNotes?: boolean;
}

/**
 * Receipt / payment order. For invoices in foreign currency cancelled at a
 * different exchange rate, it adds a debit (or credit) note per VAT rate that is
 * created and applied in the same transaction, so the invoice ends fully paid
 * and the cuenta corriente balances.
 */
/**
 * Pesos per unit of the invoice currency (applications.fx_rate). Receipts and
 * payment orders are always in the base currency, so a peso invoice → 1 and a
 * (legacy) USD invoice → the payment-day rate.
 */
export function applicationRate(invoiceCurrency: string, baseCurrency: string, fxRate: number) {
  return invoiceCurrency === baseCurrency ? 1 : fxRate;
}

const docLabel = (inv: InvoiceForPayment) => `${inv.letter ?? ""} ${String(inv.point_of_sale).padStart(5, "0")}-${String(inv.number).padStart(8, "0")}`.trim();

export function buildPaymentRpc(org: OrgInfo, party: PartyInfo, p: PaymentInput, invoices: InvoiceForPayment[]) {
  const side = p.type === "recibo" ? "venta" : "compra";
  const ledger = p.ledger ?? "blanco";
  const base = org.base_currency;
  const currency = p.currency ?? base;
  const inForeign = currency !== base;
  if (inForeign && !(p.fxRate > 0)) throw new Error("Falta el tipo de cambio del día del pago");
  // Dollars are pesified at the payment-day rate.
  const items = p.items.map((i) => ({ ...i, ars: inForeign ? r2(i.amount * p.fxRate) : r2(i.amount) }));
  const total = r2(items.reduce((s, i) => s + i.ars, 0));
  const paidForeign = r2(p.items.reduce((s, i) => s + i.amount, 0));
  const fxNotes: unknown[] = [];
  let consumed = 0;
  const applications = p.applications.map((a) => {
    const inv = invoices.find((i) => i.id === a.invoiceId);
    if (!inv) throw new Error("Comprobante a cancelar inexistente");
    const foreign = inv.currency !== base;
    const isInvoice = inv.type === "factura_venta" || inv.type === "factura_compra" || inv.type === "nota_debito_venta" || inv.type === "nota_debito_compra";

    // Liquidación: cancel the dollar value of a peso invoice + ND/NC for the difference.
    if (a.settle && !foreign) {
      if (!isInvoice) throw new Error("Solo se liquidan facturas y notas de débito");
      const byRate = new Map<number, number>();
      for (const l of inv.lines) byRate.set(Number(l.vat_rate), (byRate.get(Number(l.vat_rate)) ?? 0) + Number(l.net));
      const s = fxSettlement({
        side,
        totalArs: Number(inv.total),
        pendingArs: Number(inv.pending ?? inv.total),
        invoiceRate: Number(inv.usd_rate),
        usdPaid: Number(inv.usd_paid ?? 0),
        paymentRate: p.fxRate,
        vatBases: [...byRate].map(([rate, b]) => ({ rate, base: b })),
      });
      if (!s) throw new Error(`El comprobante ${docLabel(inv)} no tiene tipo de cambio para liquidar la diferencia`);
      const pendingArs = Number(inv.pending ?? inv.total);
      if (s.note) {
        const debit = s.difference > 0;
        fxNotes.push({
          ...(debit ? {} : { apply_to: inv.id }),
          doc: {
            type: s.note.type,
            letter: letterFor(s.note.type, org, party, ledger),
            point_of_sale: side === "venta" ? inv.point_of_sale : 1,
            issue_date: p.issueDate,
            currency: base,
            fx_rate: 1,
            usd_rate: p.fxRate,
            net: s.note.net,
            vat: s.note.vat,
            total: s.note.total,
            status: "issued",
            source_document_id: inv.id,
            concept: "diferencia_cambio",
            meta: { mode: "liquidacion", invoiceFx: Number(inv.usd_rate), paymentFx: p.fxRate, usdPending: s.usdPending, pendingArs },
            notes: `Diferencia de cambio s/ ${docLabel(inv)}: USD ${s.usdPending} · TC ${inv.usd_rate} → ${p.fxRate}`,
          },
          lines: s.note.lines.map((l) => ({
            description: `Diferencia de cambio s/ ${docLabel(inv)} (IVA ${l.rate}%)`,
            quantity: 1,
            unit: "u",
            unit_price: l.net,
            vat_rate: l.rate,
            net: l.net,
            vat: l.vat,
          })),
        });
      }
      // ND: the receipt pays the invoice pending + the ND. NC: it pays what is left after the NC.
      const applied = s.difference > 0 ? pendingArs : s.arsToSettle;
      consumed += s.arsToSettle;
      return { invoice_document_id: a.invoiceId, amount: r2(applied), fx_rate: 1 };
    }

    // Legacy USD invoices cancelled in pesos: automatic ND/NC at payment time.
    if (foreign && p.autoFxNotes !== false && (inv.type === "factura_venta" || inv.type === "factura_compra")) {
      const byRate = new Map<number, number>();
      for (const l of inv.lines) byRate.set(Number(l.vat_rate), (byRate.get(Number(l.vat_rate)) ?? 0) + Number(l.net));
      const diff = exchangeDifferenceByRate({
        side,
        vatBases: [...byRate].map(([rate, b]) => ({ rate, base: b })),
        foreignTotal: Number(inv.total),
        appliedForeign: a.amount,
        invoiceFx: Number(inv.fx_rate),
        paymentFx: p.fxRate,
      });
      if (!diff.isZero) {
        fxNotes.push({
          doc: {
            type: diff.type,
            letter: letterFor(diff.type, org, party, ledger),
            point_of_sale: side === "venta" ? inv.point_of_sale : 1,
            issue_date: p.issueDate,
            currency: base,
            fx_rate: 1,
            net: diff.net,
            vat: diff.vat,
            total: diff.total,
            status: "issued",
            source_document_id: inv.id,
            concept: "diferencia_cambio",
            meta: { invoiceFx: Number(inv.fx_rate), paymentFx: p.fxRate, appliedForeign: a.amount, invoiceCurrency: inv.currency },
            notes: `Diferencia de cambio s/ ${docLabel(inv)}: USD ${a.amount} · TC ${inv.fx_rate} → ${p.fxRate}`,
          },
          lines: diff.lines.map((l) => ({
            description: `Diferencia de cambio s/ ${docLabel(inv)} (IVA ${l.rate}%)`,
            quantity: 1,
            unit: "u",
            unit_price: l.net,
            vat_rate: l.rate,
            net: l.net,
            vat: l.vat,
          })),
        });
      }
    }
    const rate = applicationRate(inv.currency, base, p.fxRate);
    consumed += a.amount * rate;
    return { invoice_document_id: a.invoiceId, amount: r2(a.amount), fx_rate: rate };
  });
  if (r2(consumed) > total + 0.01) {
    throw new Error(`Lo imputado (${r2(consumed)}) supera el total del ${p.type === "recibo" ? "cobro" : "pago"} en pesos (${total})`);
  }

  return {
    p_doc: {
      org_id: org.id,
      party_id: party.id,
      type: p.type,
      ledger,
      issue_date: p.issueDate,
      currency: base,
      fx_rate: 1,
      usd_rate: p.fxRate > 0 ? p.fxRate : null,
      total,
      status: "issued",
      notes: p.notes ?? null,
      meta: inForeign ? { paidCurrency: currency, paidAmount: paidForeign, paymentFx: p.fxRate } : {},
    },
    p_lines: [],
    p_payments: items.map((i) => ({
      method: i.method,
      amount: i.ars,
      reference: i.reference ?? null,
      cheque_id: i.chequeId ?? null,
      currency: inForeign ? currency : null,
      fx_rate: inForeign ? p.fxRate : null,
      amount_currency: inForeign ? i.amount : null,
      cheque: i.cheque
        ? { bank: i.cheque.bank, number: i.cheque.number, drawer_name: i.cheque.drawerName ?? null, drawer_tax_id: i.cheque.drawerTaxId ?? null, payment_date: i.cheque.paymentDate }
        : undefined,
    })),
    p_applications: applications,
    p_fx_notes: fxNotes,
  };
}
