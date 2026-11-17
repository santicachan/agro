/**
 * Pure builders for the `create_document` RPC. Shared by the server actions and
 * the demo seed script so both produce exactly the same documents.
 */
import { DOC_TYPES, computeTotals, exchangeDifferenceByRate, invoiceLetter, type DocType, type LineInput, type TaxCondition } from "./documents";

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

/** Letter: sales use our condition as issuer; purchases use the supplier as issuer. */
export function letterFor(type: DocType, org: OrgInfo, party: PartyInfo) {
  const meta = DOC_TYPES[type];
  if (meta.payment || type === "remito" || type === "canje") return null;
  const orgCond = (org.tax_condition ?? "RI") as TaxCondition;
  const partyCond = (party.tax_condition ?? "CF") as TaxCondition;
  return meta.side === "venta" ? invoiceLetter(orgCond, partyCond) : invoiceLetter(partyCond === "CF" ? "MONO" : partyCond, orgCond);
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
  otherTaxes?: number;
  notes?: string | null;
  sourceDocumentId?: string | null;
  lines: (LineInput & { unit?: string; productId?: string | null })[];
  /** For NC: cancel this amount (in the source invoice currency) of the source invoice. */
  applyToSource?: number | null;
}

export function buildDocumentRpc(org: OrgInfo, party: PartyInfo, d: DocumentInput) {
  const totals = computeTotals(d.lines, d.otherTaxes ?? 0);
  const foreign = d.currency !== org.base_currency;
  return {
    p_doc: {
      org_id: org.id,
      party_id: party.id,
      type: d.type,
      letter: letterFor(d.type, org, party),
      point_of_sale: d.pointOfSale ?? defaultPointOfSale(org),
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

export interface PaymentItemInput {
  method: "efectivo" | "transferencia" | "cheque" | "echeq" | "retencion" | "granos";
  amount: number;
  reference?: string | null;
  chequeId?: string | null;
  cheque?: { bank: string; number: string; drawerName?: string | null; drawerTaxId?: string | null; paymentDate: string } | null;
}

export interface PaymentInput {
  type: "recibo" | "orden_pago";
  issueDate: string;
  fxRate: number;
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
export function buildPaymentRpc(org: OrgInfo, party: PartyInfo, p: PaymentInput, invoices: InvoiceForPayment[]) {
  const side = p.type === "recibo" ? "venta" : "compra";
  const total = r2(p.items.reduce((s, i) => s + i.amount, 0));
  const fxNotes: unknown[] = [];
  const applications = p.applications.map((a) => {
    const inv = invoices.find((i) => i.id === a.invoiceId);
    if (!inv) throw new Error("Comprobante a cancelar inexistente");
    const foreign = inv.currency !== org.base_currency;
    if (foreign && p.autoFxNotes !== false && (inv.type === "factura_venta" || inv.type === "factura_compra")) {
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
            letter: letterFor(diff.type, org, party),
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
    return { invoice_document_id: a.invoiceId, amount: r2(a.amount), fx_rate: foreign ? p.fxRate : 1 };
  });

  return {
    p_doc: {
      org_id: org.id,
      party_id: party.id,
      type: p.type,
      issue_date: p.issueDate,
      currency: org.base_currency,
      fx_rate: 1,
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
