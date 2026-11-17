"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCrm } from "@/lib/auth";
import { friendlyDbError } from "@/lib/billing/plans";
import { arcaPreflight, buildFECAERequest, getEInvoicingProvider, isArcaConfigured, type ArcaDocument } from "./arca";
import { computeTotals, formatCuit, isValidCuit } from "./documents";
import { buildDocumentRpc, buildPaymentRpc } from "./payloads";

export interface ActionState {
  error?: string;
  ok?: boolean;
}

const trimmed = z.string().trim();
const optional = trimmed.optional().transform((v) => (v ? v : null));

// ─────────────────────────────────────────────── Parties
const partySchema = z.object({
  id: optional,
  kind: z.enum(["customer", "supplier", "both"]),
  name: trimmed.min(1, "El nombre es obligatorio"),
  tax_id: optional,
  tax_condition: z.enum(["RI", "MONO", "EX", "CF"]).default("RI"),
  email: optional,
  phone: optional,
  address: optional,
  city: optional,
  province: optional,
  notes: optional,
});

export async function saveParty(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, org } = await requireCrm();
  const parsed = partySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const { id, ...data } = parsed.data;
  const query = id
    ? supabase.from("parties").update(data).eq("id", id).eq("org_id", org.id).select("id").single()
    : supabase.from("parties").insert({ ...data, org_id: org.id }).select("id").single();
  const { data: row, error } = await query;
  if (error) return { error: friendlyDbError(error.message) };
  const base = data.kind === "supplier" ? "/app/proveedores" : "/app/clientes";
  revalidatePath(base);
  redirect(`${base}/${row.id}`);
}

// ─────────────────────────────────────────────── Documents (remitos, facturas, NC/ND)
const lineSchema = z.object({
  description: trimmed.min(1, "Cada renglón necesita una descripción"),
  quantity: z.coerce.number().positive("La cantidad debe ser mayor a 0"),
  unit: trimmed.default("u"),
  unitPrice: z.coerce.number().min(0),
  vatRate: z.coerce.number().min(0),
  productId: optional,
});

const documentSchema = z.object({
  type: z.enum(["remito", "factura_venta", "nota_credito_venta", "nota_debito_venta", "factura_compra", "nota_credito_compra", "nota_debito_compra"]),
  partyId: z.uuid("Elegí un cliente o proveedor"),
  issueDate: trimmed.regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: optional,
  currency: z.enum(["ARS", "USD", "BRL"]),
  fxRate: z.coerce.number().positive(),
  pointOfSale: z.coerce.number().int().min(1).max(99999).optional(),
  number: z.coerce.number().int().min(1).max(99999999).optional(),
  otherTaxes: z.coerce.number().min(0).default(0),
  notes: optional,
  sourceDocumentId: optional,
  lines: z.array(lineSchema).min(1, "Agregá al menos un renglón"),
});

export type DocumentPayload = z.input<typeof documentSchema>;

const NOTE_TYPES = ["nota_credito_venta", "nota_debito_venta", "nota_credito_compra", "nota_debito_compra"];

export async function createDocument(payload: DocumentPayload): Promise<ActionState & { id?: string }> {
  const { supabase, org } = await requireCrm();
  const parsed = documentSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const { data: party } = await supabase.from("parties").select("id, tax_condition").eq("id", d.partyId).eq("org_id", org.id).single();
  if (!party) return { error: "Cliente/proveedor inexistente" };

  let applyToSource: number | null = null;
  if (d.sourceDocumentId && NOTE_TYPES.includes(d.type)) {
    const { data: src } = await supabase.from("documents").select("currency, party_id").eq("id", d.sourceDocumentId).eq("org_id", org.id).single();
    if (!src || src.party_id !== d.partyId) return { error: "El comprobante asociado no corresponde a este cliente/proveedor" };
    if (src.currency !== d.currency) return { error: `La nota tiene que estar en la misma moneda que el comprobante asociado (${src.currency})` };
    // A credit note cancels (part of) the associated invoice.
    if (d.type.startsWith("nota_credito")) {
      const { data: bal } = await supabase.from("document_balances").select("pending").eq("id", d.sourceDocumentId).single();
      const total = computeTotals(d.lines, d.otherTaxes).total;
      applyToSource = Math.min(total, Number(bal?.pending ?? 0));
    }
  }

  const { data: id, error } = await supabase.rpc(
    "create_document",
    buildDocumentRpc(org, party, {
      type: d.type,
      issueDate: d.issueDate,
      dueDate: d.dueDate,
      currency: d.currency,
      fxRate: d.fxRate,
      pointOfSale: d.pointOfSale,
      number: d.number,
      otherTaxes: d.otherTaxes,
      notes: d.notes,
      sourceDocumentId: d.sourceDocumentId,
      applyToSource,
      lines: d.lines,
    }),
  );
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app/comprobantes");
  return { ok: true, id: id as string };
}

type LineRow = { description: string; quantity: number; unit: string; unit_price: number; vat_rate: number; product_id: string | null };
const rowsToLines = (rows: LineRow[]) =>
  rows.map((l) => ({ description: l.description, quantity: Number(l.quantity), unit: l.unit, unitPrice: Number(l.unit_price), vatRate: Number(l.vat_rate), productId: l.product_id ?? undefined }));

async function copyDocument(sourceId: string, from: "remito" | "factura_venta", to: "remito" | "factura_venta") {
  const { supabase, org } = await requireCrm();
  const { data: src } = await supabase.from("documents").select("*, document_lines(*)").eq("id", sourceId).eq("org_id", org.id).eq("type", from).single();
  if (!src) redirect("/app/comprobantes");
  const res = await createDocument({
    type: to,
    partyId: src.party_id,
    issueDate: new Date().toISOString().slice(0, 10),
    currency: src.currency,
    fxRate: Number(src.fx_rate),
    pointOfSale: src.point_of_sale,
    sourceDocumentId: src.id,
    notes: src.notes ?? undefined,
    lines: rowsToLines(src.document_lines as LineRow[]),
  });
  if (res.error || !res.id) redirect(`/app/comprobantes/${sourceId}?error=${encodeURIComponent(res.error ?? "error")}`);
  redirect(`/app/comprobantes/${res.id}`);
}

/** Remito → Factura: copies lines and links the invoice to the delivery note. */
export async function invoiceFromRemito(remitoId: string) {
  return copyDocument(remitoId, "remito", "factura_venta");
}

/** Factura → Remito: delivery note for an invoice, linked to it. */
export async function remitoFromInvoice(invoiceId: string) {
  return copyDocument(invoiceId, "factura_venta", "remito");
}

/**
 * "Autorizar en ARCA": validates everything ARCA would check, prepares and stores
 * the FECAESolicitar request, and calls the e-invoicing provider. Until the
 * certificate is loaded the document stays "listo para ARCA" and nothing is faked.
 */
export async function authorizeWithArca(documentId: string) {
  const { supabase, org } = await requireCrm();
  const { data: doc } = await supabase.from("documents").select("*, parties(tax_id, tax_condition), document_lines(*)").eq("id", documentId).eq("org_id", org.id).single();
  if (!doc) redirect("/app/comprobantes");
  if (doc.status === "authorized") redirect(`/app/comprobantes/${documentId}`);
  const back = (q: string) => redirect(`/app/comprobantes/${documentId}?${q}`);

  const lines = (doc.document_lines as { quantity: number; unit_price: number; vat_rate: number; description: string }[]).map((l) => ({
    description: l.description,
    quantity: Number(l.quantity),
    unitPrice: Number(l.unit_price),
    vatRate: Number(l.vat_rate),
  }));
  const totals = computeTotals(lines, Number(doc.other_taxes));
  const party = doc.parties as { tax_id: string | null; tax_condition: string | null } | null;
  const configuredPos = Number((org.arca_config as { pointOfSale?: number } | null)?.pointOfSale) || null;
  const errors = arcaPreflight({
    type: doc.type,
    letter: doc.letter,
    pointOfSale: doc.point_of_sale,
    issueDate: doc.issue_date,
    issuerCuit: org.tax_id,
    receiverCuit: party?.tax_id ?? null,
    receiverCondition: party?.tax_condition ?? null,
    vatRates: totals.vatByRate.map((v) => v.rate),
    total: Number(doc.total),
    configuredPointOfSale: configuredPos,
  });
  if (errors.length) back(`arca_errors=${encodeURIComponent(JSON.stringify(errors))}`);

  // Associated invoice is mandatory for credit/debit notes.
  let associated: ArcaDocument["associated"];
  if (doc.source_document_id && doc.type !== "factura_venta") {
    const { data: src } = await supabase.from("documents").select("type, letter, point_of_sale, number, issue_date").eq("id", doc.source_document_id).single();
    if (src?.letter && ["factura_venta", "nota_debito_venta", "nota_credito_venta"].includes(src.type)) {
      associated = [{ type: src.type, letter: src.letter, pointOfSale: src.point_of_sale, number: src.number, cuit: org.tax_id ?? "", date: src.issue_date }];
    }
  }
  const arcaDoc: ArcaDocument = {
    type: doc.type,
    letter: doc.letter,
    pointOfSale: doc.point_of_sale,
    number: doc.number,
    issueDate: doc.issue_date,
    receiverTaxId: party?.tax_id ?? null,
    currency: doc.currency,
    fxRate: Number(doc.fx_rate),
    net: Number(doc.net),
    vat: Number(doc.vat),
    otherTaxes: Number(doc.other_taxes),
    total: Number(doc.total),
    vatByRate: totals.vatByRate,
    associated,
  };
  const request = buildFECAERequest(arcaDoc);
  const preparedAt = new Date().toISOString();

  if (!isArcaConfigured()) {
    await supabase.from("documents").update({ arca_response: { status: "ready", preparedAt, request } }).eq("id", documentId);
    revalidatePath(`/app/comprobantes/${documentId}`);
    back("arca=listo");
  }
  // redirect() throws, so it must stay outside try/catch.
  let outcome = "arca=ok";
  try {
    const result = await getEInvoicingProvider().authorize(arcaDoc, org.tax_id ?? "");
    const { error } = await supabase
      .from("documents")
      .update({ cae: result.cae, cae_due: result.caeDue, arca_response: { status: "authorized", preparedAt, request, response: result.raw }, status: "authorized" })
      .eq("id", documentId);
    if (error) outcome = `error=${encodeURIComponent(friendlyDbError(error.message))}`;
  } catch (e) {
    await supabase.from("documents").update({ arca_response: { status: "rejected", preparedAt, request, error: (e as Error).message } }).eq("id", documentId);
    outcome = `error=${encodeURIComponent((e as Error).message)}`;
  }
  revalidatePath(`/app/comprobantes/${documentId}`);
  back(outcome);
}

// ─────────────────────────────────────────────── Payments (recibos / órdenes de pago)
const paymentSchema = z.object({
  type: z.enum(["recibo", "orden_pago"]),
  partyId: z.uuid("Elegí un cliente o proveedor"),
  issueDate: trimmed.regex(/^\d{4}-\d{2}-\d{2}$/),
  fxRate: z.coerce.number().positive().default(1),
  notes: optional,
  items: z
    .array(
      z.object({
        method: z.enum(["efectivo", "transferencia", "cheque", "echeq", "retencion", "granos"]),
        amount: z.coerce.number().positive("Cada medio de pago necesita un importe"),
        reference: optional,
        chequeId: optional,
        cheque: z
          .object({
            bank: trimmed.min(1, "Banco del cheque"),
            number: trimmed.min(1, "Número del cheque"),
            drawerName: optional,
            drawerTaxId: optional,
            paymentDate: trimmed.regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de pago del cheque"),
          })
          .optional(),
      }),
    )
    .min(1, "Agregá al menos un medio de pago"),
  applications: z.array(z.object({ invoiceId: z.uuid(), amount: z.coerce.number().positive() })).default([]),
  /** Generate ND/NC for exchange differences on foreign-currency invoices. */
  autoFxNotes: z.boolean().default(true),
});

export type PaymentPayload = z.input<typeof paymentSchema>;

export async function createPayment(payload: PaymentPayload): Promise<ActionState & { id?: string }> {
  const { supabase, org } = await requireCrm();
  const parsed = paymentSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const p = parsed.data;
  for (const it of p.items) {
    if ((it.method === "cheque" || it.method === "echeq") && !it.chequeId && !it.cheque) return { error: "Completá los datos del cheque" };
  }
  const { data: party } = await supabase.from("parties").select("id, tax_condition").eq("id", p.partyId).eq("org_id", org.id).single();
  if (!party) return { error: "Cliente/proveedor inexistente" };

  const ids = p.applications.map((a) => a.invoiceId);
  const { data: invoices } = ids.length
    ? await supabase.from("documents").select("id, type, letter, point_of_sale, number, currency, fx_rate, total, party_id, document_lines(vat_rate, net)").in("id", ids).eq("org_id", org.id)
    : { data: [] as never[] };
  if (p.applications.some((a) => !invoices?.some((i) => i.id === a.invoiceId && i.party_id === p.partyId))) return { error: "Comprobante a cancelar inexistente" };

  let args;
  try {
    args = buildPaymentRpc(
      org,
      party,
      p,
      (invoices ?? []).map((i) => ({ ...i, fx_rate: Number(i.fx_rate), total: Number(i.total), lines: (i.document_lines ?? []).map((l: { vat_rate: number; net: number }) => ({ vat_rate: Number(l.vat_rate), net: Number(l.net) })) })),
    );
  } catch (e) {
    return { error: (e as Error).message };
  }
  const { data: id, error } = await supabase.rpc("create_document", args);
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app/comprobantes");
  revalidatePath("/app/cheques");
  return { ok: true, id: id as string };
}

// ─────────────────────────────────────────────── Cheques
const CHEQUE_TRANSITIONS: Record<string, { to: string; dateField: string }[]> = {
  en_cartera: [{ to: "depositado", dateField: "deposited_at" }],
  depositado: [{ to: "acreditado", dateField: "credited_at" }],
  emitido: [{ to: "debitado", dateField: "credited_at" }],
  endosado: [{ to: "acreditado", dateField: "credited_at" }],
};

export async function updateChequeStatus(formData: FormData) {
  const { supabase, org } = await requireCrm();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const { data: cheque } = await supabase.from("cheques").select("status").eq("id", id).eq("org_id", org.id).single();
  const t = cheque ? CHEQUE_TRANSITIONS[cheque.status]?.find((x) => x.to === status) : null;
  if (t) await supabase.from("cheques").update({ status, [t.dateField]: new Date().toISOString().slice(0, 10) }).eq("id", id);
  revalidatePath("/app/cheques");
}

/** Rejected cheque: books the debit note(s) automatically (see reject_cheque in SQL). */
export async function rejectCheque(formData: FormData) {
  const { supabase, org } = await requireCrm();
  const id = String(formData.get("id"));
  const fee = Math.max(0, Number(formData.get("fee")) || 0);
  const reason = String(formData.get("reason") ?? "").trim() || null;
  const { data: cheque } = await supabase.from("cheques").select("id").eq("id", id).eq("org_id", org.id).single();
  if (!cheque) redirect("/app/cheques");
  const { data: docId, error } = await supabase.rpc("reject_cheque", { p_cheque: id, p_fee: fee, p_fee_vat_rate: 21, p_reason: reason });
  revalidatePath("/app/cheques");
  if (error) redirect(`/app/cheques?ver=todos&error=${encodeURIComponent(friendlyDbError(error.message))}`);
  redirect(docId ? `/app/comprobantes/${docId}?cheque=rechazado` : "/app/cheques?ver=todos");
}

// ─────────────────────────────────────────────── Configuración (empresa + ARCA)
const settingsSchema = z.object({
  name: trimmed.min(2, "Nombre de la empresa"),
  tax_id: trimmed.refine((v) => !v || isValidCuit(v), "El CUIT no es válido"),
  tax_condition: z.enum(["RI", "MONO", "EX"]),
  pointOfSale: z.coerce.number().int().min(1, "Punto de venta entre 1 y 99999").max(99999),
  environment: z.enum(["homologacion", "produccion"]),
});

export async function saveSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, org, role } = await requireCrm();
  if (!["owner", "admin"].includes(role)) return { error: "Solo el dueño o un administrador puede cambiar la configuración." };
  const parsed = settingsSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const s = parsed.data;
  const { error } = await supabase
    .from("organizations")
    .update({
      name: s.name,
      tax_id: s.tax_id ? formatCuit(s.tax_id) : null,
      tax_condition: s.tax_condition,
      arca_config: { ...(org.arca_config ?? {}), pointOfSale: s.pointOfSale, environment: s.environment },
    })
    .eq("id", org.id);
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app", "layout");
  return { ok: true };
}

// ─────────────────────────────────────────────── Canje
const swapSchema = z.object({
  partyId: z.uuid("Elegí un cliente"),
  crop: z.enum(["soja", "maiz", "trigo", "girasol", "sorgo", "cebada"]),
  tons: z.coerce.number().positive("Toneladas mayores a 0"),
  priceUsdT: z.coerce.number().positive("Precio mayor a 0"),
  referencePriceSource: optional,
  deliveryFrom: optional,
  deliveryTo: optional,
});

export async function createSwap(_: ActionState, formData: FormData): Promise<ActionState> {
  const { supabase, org } = await requireCrm();
  const parsed = swapSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const s = parsed.data;
  const { error } = await supabase.from("grain_swaps").insert({
    org_id: org.id,
    party_id: s.partyId,
    crop: s.crop,
    tons: s.tons,
    price_usd_t: s.priceUsdT,
    reference_price_source: s.referencePriceSource,
    delivery_from: s.deliveryFrom,
    delivery_to: s.deliveryTo,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app/canjes");
  redirect("/app/canjes");
}

export async function registerSwapDelivery(formData: FormData) {
  const { supabase, org } = await requireCrm();
  const id = String(formData.get("id"));
  const tons = Number(formData.get("tons"));
  if (!(tons > 0)) return;
  const { data: swap } = await supabase.from("grain_swaps").select("tons, delivered_tons").eq("id", id).eq("org_id", org.id).single();
  if (!swap) return;
  const delivered = Math.min(Number(swap.tons), Number(swap.delivered_tons) + tons);
  await supabase
    .from("grain_swaps")
    .update({ delivered_tons: delivered, status: delivered >= Number(swap.tons) ? "cumplido" : "parcial" })
    .eq("id", id);
  revalidatePath("/app/canjes");
}
