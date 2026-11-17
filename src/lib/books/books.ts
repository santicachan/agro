/**
 * Accounting books for the accountant (Libro IVA Ventas/Compras, alícuotas,
 * detalle, NC/ND, diferencias de cambio). Pure functions over documents so they
 * are unit-tested and render identically to Excel and PDF.
 *
 * All amounts are converted to the organization's base currency using each
 * document's exchange rate, as the IVA books require. Credit notes are negative.
 */
import { CONCEPT_LABEL, DOC_TYPES, formatDocNumber, type DocType, type TaxCondition } from "@/lib/crm/documents";

const COND_SHORT: Record<TaxCondition, string> = { RI: "RI", MONO: "Monotributo", EX: "Exento", CF: "Cons. Final" };

export interface BookDocument {
  id: string;
  type: DocType;
  letter: string | null;
  point_of_sale: number;
  number: number;
  issue_date: string;
  currency: string;
  fx_rate: number;
  net: number;
  vat: number;
  other_taxes: number;
  total: number;
  status: string;
  cae: string | null;
  cae_due: string | null;
  concept: string | null;
  meta: Record<string, unknown> | null;
  notes: string | null;
  source_document_id: string | null;
  party: { name: string; tax_id: string | null; tax_condition: TaxCondition | null };
  lines: { vat_rate: number; net: number; vat: number }[];
}

export type ColumnType = "text" | "date" | "money" | "number";
export interface Column {
  key: string;
  label: string;
  type: ColumnType;
  width?: number;
}
export type Row = Record<string, string | number | null>;
export interface Book {
  id: BookId;
  title: string;
  subtitle: string;
  columns: Column[];
  rows: Row[];
  totals?: Row;
  notes?: string[];
}

export type BookId = "iva-ventas" | "iva-compras" | "alicuotas" | "detalle" | "notas" | "diferencias-cambio";

export const BOOKS: { id: BookId; title: string; description: string }[] = [
  { id: "iva-ventas", title: "Libro IVA Ventas", description: "Facturas, notas de crédito y débito emitidas, con neto e IVA por alícuota." },
  { id: "iva-compras", title: "Libro IVA Compras", description: "Comprobantes de proveedores con el crédito fiscal discriminado." },
  { id: "alicuotas", title: "Resumen de alícuotas", description: "Débito y crédito fiscal por alícuota y saldo técnico de IVA." },
  { id: "detalle", title: "Detalle de comprobantes", description: "Todos los comprobantes del período: remitos, facturas, recibos, órdenes de pago y notas." },
  { id: "notas", title: "Notas de crédito y débito", description: "Listado de NC y ND con su motivo y comprobante asociado." },
  { id: "diferencias-cambio", title: "Diferencias de cambio", description: "Notas por diferencia de cambio con TC de la factura y del cobro." },
];

export const SALES_TYPES: DocType[] = ["factura_venta", "nota_debito_venta", "nota_credito_venta"];
export const PURCHASE_TYPES: DocType[] = ["factura_compra", "nota_debito_compra", "nota_credito_compra"];
const RATES = [21, 10.5, 27] as const;

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const sign = (t: DocType) => (t === "nota_credito_venta" || t === "nota_credito_compra" ? -1 : 1);
const isValid = (d: BookDocument) => d.status === "issued" || d.status === "authorized";

export function docNumber(d: Pick<BookDocument, "type" | "letter" | "point_of_sale" | "number">) {
  return `${DOC_TYPES[d.type].short}${d.letter ? ` ${d.letter}` : ""} ${formatDocNumber(d.point_of_sale, d.number)}`;
}

export function periodLabel(year: number, month: number | null) {
  if (!month) return `Año ${year}`;
  const name = new Intl.DateTimeFormat("es-AR", { month: "long" }).format(new Date(year, month - 1, 15));
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${year}`;
}

export function periodRange(year: number, month: number | null): { from: string; to: string } {
  if (!month) return { from: `${year}-01-01`, to: `${year}-12-31` };
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(last).padStart(2, "0")}` };
}

/** Net and VAT per rate in base currency (signed). Rate 0 lines go to "no gravado / exento". */
function vatBreakdown(d: BookDocument) {
  const k = d.fx_rate * sign(d.type);
  const out: Record<string, number> = { exento: 0 };
  for (const rate of RATES) {
    out[`neto_${rate}`] = 0;
    out[`iva_${rate}`] = 0;
  }
  if (d.letter === "C") {
    // Facturas C don't discriminate IVA: the whole amount is informed as "no gravado / exento".
    out.exento = r2((d.total - d.other_taxes) * k);
    return out;
  }
  for (const l of d.lines) {
    const rate = Number(l.vat_rate);
    if (rate === 0 || !RATES.includes(rate as (typeof RATES)[number])) {
      out.exento = r2(out.exento + Number(l.net) * k);
      if (rate !== 0) out.exento = r2(out.exento + Number(l.vat) * k);
      continue;
    }
    out[`neto_${rate}`] = r2(out[`neto_${rate}`] + Number(l.net) * k);
    out[`iva_${rate}`] = r2(out[`iva_${rate}`] + Number(l.vat) * k);
  }
  return out;
}

function sumRows(rows: Row[], keys: string[], label: Row): Row {
  const t: Row = { ...label };
  for (const k of keys) t[k] = r2(rows.reduce((s, r) => s + (Number(r[k]) || 0), 0));
  return t;
}

const ivaColumns = (partyLabel: string): Column[] => [
  { key: "fecha", label: "Fecha", type: "date", width: 11 },
  { key: "comprobante", label: "Comprobante", type: "text", width: 22 },
  { key: "parte", label: partyLabel, type: "text", width: 28 },
  { key: "cuit", label: "CUIT", type: "text", width: 15 },
  { key: "condicion", label: "Cond. IVA", type: "text", width: 11 },
  { key: "neto_21", label: "Neto 21%", type: "money" },
  { key: "iva_21", label: "IVA 21%", type: "money" },
  { key: "neto_10.5", label: "Neto 10,5%", type: "money" },
  { key: "iva_10.5", label: "IVA 10,5%", type: "money" },
  { key: "neto_27", label: "Neto 27%", type: "money" },
  { key: "iva_27", label: "IVA 27%", type: "money" },
  { key: "exento", label: "No grav./Ex.", type: "money" },
  { key: "otros", label: "Otros tributos", type: "money" },
  { key: "total", label: "Total", type: "money" },
  { key: "cae", label: "CAE", type: "text", width: 16 },
];
const IVA_SUM_KEYS = ["neto_21", "iva_21", "neto_10.5", "iva_10.5", "neto_27", "iva_27", "exento", "otros", "total"];

function ivaBook(id: "iva-ventas" | "iva-compras", docs: BookDocument[], subtitle: string, currency: string): Book {
  const types = id === "iva-ventas" ? SALES_TYPES : PURCHASE_TYPES;
  const rows = docs
    .filter((d) => isValid(d) && types.includes(d.type))
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.number - b.number)
    .map((d) => ({
      fecha: d.issue_date,
      comprobante: docNumber(d),
      parte: d.party.name,
      cuit: d.party.tax_id ?? "",
      condicion: d.party.tax_condition ? COND_SHORT[d.party.tax_condition] : "",
      ...vatBreakdown(d),
      otros: r2(d.other_taxes * d.fx_rate * sign(d.type)),
      total: r2(d.total * d.fx_rate * sign(d.type)),
      cae: d.cae ?? "",
    }));
  return {
    id,
    title: id === "iva-ventas" ? "Libro IVA Ventas" : "Libro IVA Compras",
    subtitle,
    columns: ivaColumns(id === "iva-ventas" ? "Cliente" : "Proveedor"),
    rows,
    totals: sumRows(rows, IVA_SUM_KEYS, { fecha: "", comprobante: "TOTAL", parte: `${rows.length} comprobantes` }),
    notes: [`Importes en ${currency}. Comprobantes en moneda extranjera convertidos al tipo de cambio de cada comprobante. Las notas de crédito restan.`],
  };
}

function alicuotasBook(docs: BookDocument[], subtitle: string, currency: string): Book {
  const ventas = ivaBook("iva-ventas", docs, subtitle, currency).totals!;
  const compras = ivaBook("iva-compras", docs, subtitle, currency).totals!;
  const rows: Row[] = [];
  for (const rate of RATES) {
    const dv = Number(ventas[`iva_${rate}`]) || 0;
    const cc = Number(compras[`iva_${rate}`]) || 0;
    rows.push({
      alicuota: `${String(rate).replace(".", ",")}%`,
      neto_ventas: Number(ventas[`neto_${rate}`]) || 0,
      debito: dv,
      neto_compras: Number(compras[`neto_${rate}`]) || 0,
      credito: cc,
      saldo: r2(dv - cc),
    });
  }
  rows.push({ alicuota: "No gravado / Exento", neto_ventas: Number(ventas.exento) || 0, debito: 0, neto_compras: Number(compras.exento) || 0, credito: 0, saldo: 0 });
  const totals = sumRows(rows, ["neto_ventas", "debito", "neto_compras", "credito", "saldo"], { alicuota: "TOTAL" });
  const saldo = Number(totals.saldo);
  return {
    id: "alicuotas",
    title: "Resumen de alícuotas de IVA",
    subtitle,
    columns: [
      { key: "alicuota", label: "Alícuota", type: "text", width: 20 },
      { key: "neto_ventas", label: "Neto ventas", type: "money" },
      { key: "debito", label: "Débito fiscal", type: "money" },
      { key: "neto_compras", label: "Neto compras", type: "money" },
      { key: "credito", label: "Crédito fiscal", type: "money" },
      { key: "saldo", label: "Saldo", type: "money" },
    ],
    rows,
    totals,
    notes: [
      saldo >= 0
        ? `Saldo técnico a pagar (débito − crédito fiscal): ${currency} ${saldo.toLocaleString("es-AR", { minimumFractionDigits: 2 })}.`
        : `Saldo técnico a favor (crédito − débito fiscal): ${currency} ${(-saldo).toLocaleString("es-AR", { minimumFractionDigits: 2 })}.`,
      "No incluye retenciones, percepciones ni saldos de períodos anteriores: verificalo con tu contadora.",
    ],
  };
}

function detalleBook(docs: BookDocument[], subtitle: string, currency: string, numbers: Map<string, string>): Book {
  const rows = docs
    .filter(isValid)
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || DOC_TYPES[a.type].label.localeCompare(DOC_TYPES[b.type].label) || a.number - b.number)
    .map((d) => ({
      fecha: d.issue_date,
      tipo: DOC_TYPES[d.type].label,
      comprobante: docNumber(d),
      parte: d.party.name,
      concepto: d.concept && d.concept in CONCEPT_LABEL ? CONCEPT_LABEL[d.concept as keyof typeof CONCEPT_LABEL] : "",
      asociado: d.source_document_id ? (numbers.get(d.source_document_id) ?? "") : "",
      moneda: d.currency,
      tc: d.currency === currency ? 1 : Number(d.fx_rate),
      neto: Number(d.net),
      iva: Number(d.vat),
      total: Number(d.total),
      total_base: r2(Number(d.total) * Number(d.fx_rate)),
      estado: d.status === "authorized" ? "Autorizado (CAE)" : "Emitido",
      cae: d.cae ?? "",
    }));
  return {
    id: "detalle",
    title: "Detalle de comprobantes",
    subtitle,
    columns: [
      { key: "fecha", label: "Fecha", type: "date", width: 11 },
      { key: "tipo", label: "Tipo", type: "text", width: 20 },
      { key: "comprobante", label: "Número", type: "text", width: 22 },
      { key: "parte", label: "Cliente / Proveedor", type: "text", width: 26 },
      { key: "concepto", label: "Concepto", type: "text", width: 18 },
      { key: "asociado", label: "Asociado a", type: "text", width: 22 },
      { key: "moneda", label: "Moneda", type: "text", width: 8 },
      { key: "tc", label: "TC", type: "number", width: 10 },
      { key: "neto", label: "Neto", type: "money" },
      { key: "iva", label: "IVA", type: "money" },
      { key: "total", label: "Total", type: "money" },
      { key: "total_base", label: `Total ${currency}`, type: "money" },
      { key: "estado", label: "Estado", type: "text", width: 16 },
      { key: "cae", label: "CAE", type: "text", width: 16 },
    ],
    rows,
    notes: [`${rows.length} comprobantes. Los remitos se informan con su valor de referencia y no afectan saldos.`],
  };
}

function notasBook(docs: BookDocument[], subtitle: string, currency: string, numbers: Map<string, string>): Book {
  const types: DocType[] = ["nota_credito_venta", "nota_debito_venta", "nota_credito_compra", "nota_debito_compra"];
  const rows = docs
    .filter((d) => isValid(d) && types.includes(d.type))
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.number - b.number)
    .map((d) => ({
      fecha: d.issue_date,
      tipo: DOC_TYPES[d.type].label,
      comprobante: docNumber(d),
      parte: d.party.name,
      motivo: d.concept && d.concept in CONCEPT_LABEL ? CONCEPT_LABEL[d.concept as keyof typeof CONCEPT_LABEL] : (d.notes ?? "").slice(0, 60),
      asociado: d.source_document_id ? (numbers.get(d.source_document_id) ?? "") : "",
      neto: r2(Number(d.net) * Number(d.fx_rate) * sign(d.type)),
      iva: r2(Number(d.vat) * Number(d.fx_rate) * sign(d.type)),
      total: r2(Number(d.total) * Number(d.fx_rate) * sign(d.type)),
      cae: d.cae ?? "",
    }));
  return {
    id: "notas",
    title: "Notas de crédito y débito",
    subtitle,
    columns: [
      { key: "fecha", label: "Fecha", type: "date", width: 11 },
      { key: "tipo", label: "Tipo", type: "text", width: 18 },
      { key: "comprobante", label: "Número", type: "text", width: 22 },
      { key: "parte", label: "Cliente / Proveedor", type: "text", width: 26 },
      { key: "motivo", label: "Motivo", type: "text", width: 26 },
      { key: "asociado", label: "Asociado a", type: "text", width: 22 },
      { key: "neto", label: "Neto", type: "money" },
      { key: "iva", label: "IVA", type: "money" },
      { key: "total", label: "Total", type: "money" },
      { key: "cae", label: "CAE", type: "text", width: 16 },
    ],
    rows,
    totals: sumRows(rows, ["neto", "iva", "total"], { fecha: "", tipo: "TOTAL" }),
    notes: [`Importes en ${currency}; las notas de crédito restan.`],
  };
}

function fxBook(docs: BookDocument[], subtitle: string, currency: string, numbers: Map<string, string>): Book {
  const rows = docs
    .filter((d) => isValid(d) && d.concept === "diferencia_cambio")
    .sort((a, b) => a.issue_date.localeCompare(b.issue_date) || a.number - b.number)
    .map((d) => {
      const m = (d.meta ?? {}) as { invoiceFx?: number; paymentFx?: number; appliedForeign?: number; invoiceCurrency?: string };
      return {
        fecha: d.issue_date,
        comprobante: docNumber(d),
        parte: d.party.name,
        factura: d.source_document_id ? (numbers.get(d.source_document_id) ?? "") : "",
        cancelado: m.appliedForeign ?? null,
        moneda: m.invoiceCurrency ?? "USD",
        tc_factura: m.invoiceFx ?? null,
        tc_pago: m.paymentFx ?? null,
        neto: r2(Number(d.net) * sign(d.type)),
        iva: r2(Number(d.vat) * sign(d.type)),
        total: r2(Number(d.total) * sign(d.type)),
      };
    });
  return {
    id: "diferencias-cambio",
    title: "Resumen de diferencias de cambio",
    subtitle,
    columns: [
      { key: "fecha", label: "Fecha", type: "date", width: 11 },
      { key: "comprobante", label: "Nota", type: "text", width: 22 },
      { key: "parte", label: "Cliente / Proveedor", type: "text", width: 26 },
      { key: "factura", label: "Factura original", type: "text", width: 22 },
      { key: "moneda", label: "Moneda", type: "text", width: 8 },
      { key: "cancelado", label: "Importe cancelado", type: "money" },
      { key: "tc_factura", label: "TC factura", type: "number", width: 11 },
      { key: "tc_pago", label: "TC cobro/pago", type: "number", width: 12 },
      { key: "neto", label: "Neto", type: "money" },
      { key: "iva", label: "IVA", type: "money" },
      { key: "total", label: "Total", type: "money" },
    ],
    rows,
    totals: sumRows(rows, ["neto", "iva", "total"], { fecha: "", comprobante: "TOTAL" }),
    notes: [`Importes en ${currency}. Positivo: nota de débito (el dólar subió). Negativo: nota de crédito (el dólar bajó).`],
  };
}

/**
 * Builds a book. `related` resolves numbers of documents outside the period
 * (e.g. an invoice from last month cancelled this month).
 */
export function buildBook(id: BookId, docs: BookDocument[], opts: { orgName: string; currency: string; period: string; related?: BookDocument[] }): Book {
  const subtitle = `${opts.orgName} · ${opts.period}`;
  const numbers = new Map<string, string>([...(opts.related ?? []), ...docs].map((d) => [d.id, docNumber(d)]));
  switch (id) {
    case "iva-ventas":
    case "iva-compras":
      return ivaBook(id, docs, subtitle, opts.currency);
    case "alicuotas":
      return alicuotasBook(docs, subtitle, opts.currency);
    case "detalle":
      return detalleBook(docs, subtitle, opts.currency, numbers);
    case "notas":
      return notasBook(docs, subtitle, opts.currency, numbers);
    case "diferencias-cambio":
      return fxBook(docs, subtitle, opts.currency, numbers);
  }
}

export function isBookId(v: string): v is BookId {
  return BOOKS.some((b) => b.id === v);
}
