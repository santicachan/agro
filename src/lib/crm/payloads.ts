/**
 * Pure builders for the `create_document` RPC. Shared by the server actions and
 * the demo seed script so both produce exactly the same documents.
 */
import { DOC_TYPES, computeTotals, exchangeDifferenceByRate, invoiceLetter, type DocType, type LineInput, type TaxCondition } from "./documents";
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
      usd_rate: d.currency === "USD" ? d.fxRate : d.usdRate && d.usdRate > 0 ? d.usdRate : null,
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
  /** Base currency per USD on the payment day. */
  fxRate: number;
  /** Currency of the payment (amounts of the items). Defaults to the base currency. */
  currency?: string;
  ledger?: Ledger;
  notes?: string | null;
  items: PaymentItemInput[];
  applications: { invoiceId: string; amount: number }[];
  autoFxNotes?: boolean;
}

/**
 * Receipt / payment order. For invoices in foreign currency cancelled at a
 * different exchange rate, it adds a debit (or credit) note per VAT rate that is
 * created and applied in the same transaction, so the invoice ends fully paid
 * and the cuenta corriente balances.
 */
/**
 * Units of the payment currency per unit of the invoice currency (applications.fx_rate).
 * Same currency → 1; USD invoice paid in pesos → TC.
 */
export function applicationRate(invoiceCurrency: string, paymentCurrency: string, baseCurrency: string, fxRate: number) {
  if (invoiceCurrency === paymentCurrency) return 1;
  if (paymentCurrency === baseCurrency) return fxRate;
  // Payments in USD only cancel USD documents (see buildPaymentRpc).
  throw new Error(`No se puede cancelar un comprobante en ${invoiceCurrency} con un pago en ${paymentCurrency}`);
}

export function buildPaymentRpc(org: OrgInfo, party: PartyInfo, p: PaymentInput, invoices: InvoiceForPayment[]) {
  const side = p.type === "recibo" ? "venta" : "compra";
  const ledger = p.ledger ?? "blanco";
  const currency = p.currency ?? org.base_currency;
  const payInBase = currency === org.base_currency;
  const total = r2(p.items.reduce((s, i) => s + i.amount, 0));
  const fxNotes: unknown[] = [];
  const applications = p.applications.map((a) => {
    const inv = invoices.find((i) => i.id === a.invoiceId);
    if (!inv) throw new Error("Comprobante a cancelar inexistente");
    if (!payInBase && inv.currency !== currency) throw new Error(`Un ${p.type === "recibo" ? "cobro" : "pago"} en ${currency} solo puede cancelar comprobantes en ${currency}`);
    const foreign = inv.currency !== org.base_currency;
    // Exchange difference only when a foreign-currency invoice is cancelled in pesos.
    // Paid in its own currency, the debt is cancelled at face value.
    if (foreign && payInBase && p.autoFxNotes !== false && (inv.type === "factura_venta" || inv.type === "factura_compra")) {
      const byRate = new Map<number, number>();
      for (const l of inv.lines) byRate.set(Number(l.vat_rate), (byRate.get(Number(l.vat_rate)) ?? 0) + Number(l.net));
      const diff = exchangeDifferenceByRate({
        side,
        vatBases: [...byRate].map(([rate, base]) => ({ rate, base })),
        foreignTotal: Number(inv.total),
        appliedForeign: a.amount,
        invoiceFx: Number(inv.fx_rate),
        paymentFx: p.fxRate,
      });
      if (!diff.isZero) {
        const label = `${inv.letter ?? ""} ${String(inv.point_of_sale).padStart(5, "0")}-${String(inv.number).padStart(8, "0")}`.trim();
        fxNotes.push({
          doc: {
            type: diff.type,
            letter: letterFor(diff.type, org, party, ledger),
            point_of_sale: side === "venta" ? inv.point_of_sale : 1,
            issue_date: p.issueDate,
            currency: org.base_currency,
            fx_rate: 1,
            net: diff.net,
            vat: diff.vat,
            total: diff.total,
            status: "issued",
            source_document_id: inv.id,
            concept: "diferencia_cambio",
            meta: { invoiceFx: Number(inv.fx_rate), paymentFx: p.fxRate, appliedForeign: a.amount, invoiceCurrency: inv.currency },
            notes: `Diferencia de cambio s/ ${label}: USD ${a.amount} · TC ${inv.fx_rate} → ${p.fxRate}`,
          },
          lines: diff.lines.map((l) => ({
            description: `Diferencia de cambio s/ ${label} (IVA ${l.rate}%)`,
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
    return { invoice_document_id: a.invoiceId, amount: r2(a.amount), fx_rate: applicationRate(inv.currency, currency, org.base_currency, p.fxRate) };
  });

  return {
    p_doc: {
      org_id: org.id,
      party_id: party.id,
      type: p.type,
      ledger,
      issue_date: p.issueDate,
      currency,
      fx_rate: payInBase ? 1 : p.fxRate,
      usd_rate: p.fxRate > 0 ? p.fxRate : null,
      total,
      status: "issued",
      notes: p.notes ?? null,
    },
    p_lines: [],
    p_payments: p.items.map((i) => ({
      method: i.method,
      amount: i.amount,
      reference: i.reference ?? null,
      cheque_id: i.chequeId ?? null,
      cheque: i.cheque
        ? { bank: i.cheque.bank, number: i.cheque.number, drawer_name: i.cheque.drawerName ?? null, drawer_tax_id: i.cheque.drawerTaxId ?? null, payment_date: i.cheque.paymentDate }
        : undefined,
    })),
    p_applications: applications,
    p_fx_notes: fxNotes,
  };
}
