"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCrm } from "@/lib/auth";
import { friendlyDbError } from "@/lib/billing/plans";
import { getEInvoicingProvider } from "./arca";
import { DOC_TYPES, computeTotals, exchangeDifference, invoiceLetter, type TaxCondition } from "./documents";

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
  pointOfSale: z.coerce.number().int().min(1).max(99999).default(1),
  otherTaxes: z.coerce.number().min(0).default(0),
  notes: optional,
  sourceDocumentId: optional,
  lines: z.array(lineSchema).min(1, "Agregá al menos un renglón"),
});

export type DocumentPayload = z.input<typeof documentSchema>;

export async function createDocument(payload: DocumentPayload): Promise<ActionState & { id?: string }> {
  const { supabase, org } = await requireCrm();
  const parsed = documentSchema.safeParse(payload);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const d = parsed.data;

  const { data: party } = await supabase.from("parties").select("id, tax_condition").eq("id", d.partyId).eq("org_id", org.id).single();
  if (!party) return { error: "Cliente/proveedor inexistente" };

  const totals = computeTotals(d.lines, d.otherTaxes);
  const fiscal = DOC_TYPES[d.type].fiscal;
  const letter = fiscal ? invoiceLetter((org.tax_condition ?? "RI") as TaxCondition, (party.tax_condition ?? "CF") as TaxCondition) : null;
  // Remitos carry quantities; their amounts are informative and do not hit the cuenta corriente.
  const { data: id, error } = await supabase.rpc("create_document", {
    p_doc: {
      org_id: org.id,
      party_id: d.partyId,
      type: d.type,
      letter,
      point_of_sale: d.pointOfSale,
      issue_date: d.issueDate,
      due_date: d.dueDate,
      currency: d.currency,
      fx_rate: d.currency === org.base_currency ? 1 : d.fxRate,
      net: totals.net,
      vat: totals.vat,
      other_taxes: d.otherTaxes,
      total: totals.total,
      status: "issued",
      source_document_id: d.sourceDocumentId,
      notes: d.notes,
    },
    p_lines: d.lines.map((l) => {
      const net = Math.round(l.quantity * l.unitPrice * 100) / 100;
      return {
        product_id: l.productId,
        description: l.description,
        quantity: l.quantity,
        unit: l.unit,
        unit_price: l.unitPrice,
        vat_rate: l.vatRate,
        net,
        vat: Math.round(net * l.vatRate) / 100,
      };
    }),
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app/comprobantes");
  return { ok: true, id: id as string };
}

/** Remito → Factura: copies lines and links the invoice to the delivery note. */
export async function invoiceFromRemito(remitoId: string) {
  const { supabase, org } = await requireCrm();
  const { data: remito } = await supabase
    .from("documents")
    .select("*, document_lines(*)")
    .eq("id", remitoId)
    .eq("org_id", org.id)
    .eq("type", "remito")
    .single();
  if (!remito) redirect("/app/comprobantes?error=remito");
  const res = await createDocument({
    type: "factura_venta",
    partyId: remito.party_id,
    issueDate: new Date().toISOString().slice(0, 10),
    currency: remito.currency,
    fxRate: Number(remito.fx_rate),
    pointOfSale: remito.point_of_sale,
    sourceDocumentId: remito.id,
    notes: remito.notes ?? undefined,
    lines: (remito.document_lines as { description: string; quantity: number; unit: string; unit_price: number; vat_rate: number; product_id: string | null }[]).map((l) => ({
      description: l.description,
      quantity: Number(l.quantity),
      unit: l.unit,
      unitPrice: Number(l.unit_price),
      vatRate: Number(l.vat_rate),
      productId: l.product_id ?? undefined,
    })),
  });
  if (res.error || !res.id) redirect(`/app/comprobantes/${remitoId}?error=${encodeURIComponent(res.error ?? "error")}`);
  redirect(`/app/comprobantes/${res.id}`);
}

export async function authorizeWithArca(documentId: string) {
  const { supabase, org } = await requireCrm();
  const { data: doc } = await supabase.from("documents").select("*, parties(tax_id), document_lines(*)").eq("id", documentId).eq("org_id", org.id).single();
  if (!doc) redirect("/app/comprobantes");
  try {
    const totals = computeTotals(
      (doc.document_lines as { quantity: number; unit_price: number; vat_rate: number; description: string }[]).map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unit_price),
        vatRate: Number(l.vat_rate),
      })),
    );
    const result = await getEInvoicingProvider().authorize(
      {
        type: doc.type,
        letter: doc.letter,
        pointOfSale: doc.point_of_sale,
        number: doc.number,
        issueDate: doc.issue_date,
        receiverTaxId: (doc.parties as { tax_id: string | null } | null)?.tax_id ?? null,
        currency: doc.currency,
        fxRate: Number(doc.fx_rate),
        net: Number(doc.net),
        vat: Number(doc.vat),
        otherTaxes: Number(doc.other_taxes),
        total: Number(doc.total),
        vatByRate: totals.vatByRate,
      },
      org.tax_id ?? "",
    );
    await supabase.from("documents").update({ cae: result.cae, cae_due: result.caeDue, arca_response: result.raw, status: "authorized" }).eq("id", documentId);
  } catch (e) {
    redirect(`/app/comprobantes/${documentId}?error=${encodeURIComponent((e as Error).message)}`);
  }
  revalidatePath(`/app/comprobantes/${documentId}`);
  redirect(`/app/comprobantes/${documentId}`);
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
  const total = Math.round(p.items.reduce((s, i) => s + i.amount, 0) * 100) / 100;

  // Load the invoices being cancelled to compute exchange differences.
  const ids = p.applications.map((a) => a.invoiceId);
  const { data: invoices } = ids.length
    ? await supabase.from("documents").select("id, type, letter, point_of_sale, currency, fx_rate, total, vat, number").in("id", ids).eq("org_id", org.id)
    : { data: [] as never[] };
  const { data: party } = await supabase.from("parties").select("tax_condition").eq("id", p.partyId).single();

  if (p.applications.some((a) => !invoices?.some((i) => i.id === a.invoiceId))) return { error: "Comprobante a cancelar inexistente" };
  const fxNotes: unknown[] = [];
  const applications = p.applications.map((a) => {
    const inv = invoices!.find((i) => i.id === a.invoiceId)!;
    const foreign = inv.currency !== org.base_currency;
    if (foreign && p.autoFxNotes && inv.type === "factura_venta") {
      const diff = exchangeDifference({
        foreignTotal: Number(inv.total),
        foreignVat: Number(inv.vat),
        invoiceFx: Number(inv.fx_rate),
        paymentFx: p.fxRate,
        appliedFraction: Math.min(1, a.amount / Number(inv.total)),
      });
      if (!diff.isZero) {
        const letter = invoiceLetter((org.tax_condition ?? "RI") as TaxCondition, (party?.tax_condition ?? "CF") as TaxCondition);
        fxNotes.push({
          doc: {
            type: diff.type,
            letter,
            point_of_sale: inv.point_of_sale,
            issue_date: p.issueDate,
            currency: org.base_currency,
            fx_rate: 1,
            net: diff.net,
            vat: diff.vat,
            total: diff.total,
            status: "issued",
            source_document_id: inv.id,
            notes: `Diferencia de cambio s/ comprobante ${inv.point_of_sale}-${inv.number} (TC ${inv.fx_rate} → ${p.fxRate})`,
          },
          lines: [{ description: "Diferencia de cambio", quantity: 1, unit: "u", unit_price: diff.net, vat_rate: diff.vatRate, net: diff.net, vat: diff.vat }],
        });
      }
    }
    return { invoice_document_id: a.invoiceId, amount: a.amount, fx_rate: foreign ? p.fxRate : 1 };
  });

  const { data: id, error } = await supabase.rpc("create_document", {
    p_doc: { org_id: org.id, party_id: p.partyId, type: p.type, issue_date: p.issueDate, currency: org.base_currency, fx_rate: 1, total, status: "issued", notes: p.notes },
    p_lines: [],
    p_payments: p.items.map((i) => ({
      method: i.method,
      amount: i.amount,
      reference: i.reference,
      cheque_id: i.chequeId,
      cheque: i.cheque
        ? { bank: i.cheque.bank, number: i.cheque.number, drawer_name: i.cheque.drawerName, drawer_tax_id: i.cheque.drawerTaxId, payment_date: i.cheque.paymentDate }
        : undefined,
    })),
    p_applications: applications,
    p_fx_notes: fxNotes,
  });
  if (error) return { error: friendlyDbError(error.message) };
  revalidatePath("/app/comprobantes");
  revalidatePath("/app/cheques");
  return { ok: true, id: id as string };
}

// ─────────────────────────────────────────────── Cheques
const CHEQUE_TRANSITIONS: Record<string, string[]> = {
  en_cartera: ["depositado", "rechazado"],
  depositado: ["acreditado", "rechazado"],
  emitido: ["debitado", "rechazado"],
};

export async function updateChequeStatus(formData: FormData) {
  const { supabase, org } = await requireCrm();
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  const { data: cheque } = await supabase.from("cheques").select("status").eq("id", id).eq("org_id", org.id).single();
  if (cheque && CHEQUE_TRANSITIONS[cheque.status]?.includes(status)) {
    await supabase.from("cheques").update({ status }).eq("id", id);
  }
  revalidatePath("/app/cheques");
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
