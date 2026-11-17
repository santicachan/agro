import "server-only";
import type { OrgContext } from "@/lib/auth";
import { CREDIT_TYPES, type DocType, type Letter, type TaxCondition } from "./documents";

export interface PartyRow {
  id: string;
  kind: "customer" | "supplier" | "both";
  name: string;
  tax_id: string | null;
  tax_condition: TaxCondition | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  province: string | null;
  notes: string | null;
}

export interface DocumentRow {
  id: string;
  party_id: string;
  type: DocType;
  letter: Letter | null;
  point_of_sale: number;
  number: number;
  issue_date: string;
  due_date: string | null;
  currency: string;
  fx_rate: number;
  net: number;
  vat: number;
  other_taxes: number;
  total: number;
  status: string;
  cae: string | null;
  cae_due: string | null;
  notes: string | null;
  source_document_id: string | null;
  concept: string | null;
  meta: Record<string, unknown> | null;
  arca_response: { status?: string; preparedAt?: string; error?: string } | null;
  parties?: { name: string; tax_id: string | null; tax_condition: TaxCondition | null } | null;
}

export type Kind = "customer" | "supplier";
export const kindFilter = (kind: Kind) => (kind === "customer" ? ["customer", "both"] : ["supplier", "both"]);

export async function listParties(ctx: OrgContext, kind: Kind, q?: string) {
  let query = ctx.supabase.from("parties").select("*").eq("org_id", ctx.org.id).in("kind", kindFilter(kind)).order("name").limit(200);
  if (q) query = query.or(`name.ilike.%${q.replace(/[%,()]/g, "")}%,tax_id.ilike.%${q.replace(/[%,()]/g, "")}%`);
  const { data } = await query;
  return (data ?? []) as PartyRow[];
}

/** Balances by party in base currency (positive = they owe us). */
export async function partyBalances(ctx: OrgContext) {
  const { data } = await ctx.supabase.from("account_movements").select("party_id, amount").eq("org_id", ctx.org.id);
  const map = new Map<string, number>();
  for (const r of data ?? []) map.set(r.party_id, (map.get(r.party_id) ?? 0) + Number(r.amount));
  return map;
}

export async function getParty(ctx: OrgContext, id: string) {
  const { data } = await ctx.supabase.from("parties").select("*").eq("id", id).eq("org_id", ctx.org.id).maybeSingle();
  return data as PartyRow | null;
}

export interface StatementRow {
  document_id: string;
  type: DocType;
  letter: Letter | null;
  point_of_sale: number;
  number: number;
  issue_date: string;
  due_date: string | null;
  currency: string;
  fx_rate: number;
  total: number;
  amount: number;
  concept: string | null;
  source_document_id: string | null;
  status: string;
  cae: string | null;
}

/**
 * Cuenta corriente of a party, oldest first, in base currency. With `from`, the
 * balance of earlier movements is returned as `opening` (saldo anterior).
 */
export async function accountStatement(ctx: OrgContext, partyId: string, range: { from?: string; to?: string } = {}) {
  let q = ctx.supabase
    .from("account_movements")
    .select("document_id, type, letter, point_of_sale, number, issue_date, due_date, currency, fx_rate, total, amount, concept, source_document_id, status, cae, created_at")
    .eq("org_id", ctx.org.id)
    .eq("party_id", partyId)
    .order("issue_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (range.to) q = q.lte("issue_date", range.to);
  const { data } = await q;
  // Same day: documents that create debt (and remitos) before the ones that cancel it, so the
  // running balance never shows an artificial intermediate value (e.g. a receipt and the
  // exchange-difference note it generated share the same timestamp).
  const rank = (t: DocType) => (CREDIT_TYPES.includes(t) ? 2 : t === "remito" ? 1 : 0);
  const all = ((data ?? []).map((r) => ({ ...r, amount: Number(r.amount), total: Number(r.total), fx_rate: Number(r.fx_rate) })) as StatementRow[])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.issue_date.localeCompare(b.r.issue_date) || rank(a.r.type) - rank(b.r.type) || a.i - b.i)
    .map(({ r }) => r);
  if (!range.from) return { opening: 0, rows: all };
  const opening = Math.round(all.filter((r) => r.issue_date < range.from!).reduce((s, r) => s + r.amount, 0) * 100) / 100;
  return { opening, rows: all.filter((r) => r.issue_date >= range.from!) };
}

export async function openItems(ctx: OrgContext, partyId: string, side: "venta" | "compra") {
  const types = side === "venta" ? ["factura_venta", "nota_debito_venta"] : ["factura_compra", "nota_debito_compra"];
  const { data } = await ctx.supabase
    .from("open_items")
    .select("*")
    .eq("org_id", ctx.org.id)
    .eq("party_id", partyId)
    .in("type", types)
    .gt("pending", 0)
    .order("issue_date");
  return (data ?? []).map((r) => ({ ...r, pending: Number(r.pending), total: Number(r.total), vat: Number(r.vat), fx_rate: Number(r.fx_rate) })) as {
    id: string;
    type: DocType;
    letter: Letter | null;
    point_of_sale: number;
    number: number;
    issue_date: string;
    currency: string;
    fx_rate: number;
    total: number;
    vat: number;
    pending: number;
  }[];
}

export async function listDocuments(ctx: OrgContext, opts: { type?: string; partyId?: string; limit?: number } = {}) {
  let q = ctx.supabase
    .from("documents")
    .select("*, parties(name, tax_id, tax_condition)")
    .eq("org_id", ctx.org.id)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.partyId) q = q.eq("party_id", opts.partyId);
  const { data } = await q;
  return (data ?? []) as DocumentRow[];
}

export async function chequesInPortfolio(ctx: OrgContext) {
  const { data } = await ctx.supabase
    .from("cheques")
    .select("id, bank, number, amount, payment_date, drawer_name, electronic")
    .eq("org_id", ctx.org.id)
    .eq("status", "en_cartera")
    .order("payment_date");
  return (data ?? []) as { id: string; bank: string; number: string; amount: number; payment_date: string; drawer_name: string | null; electronic: boolean }[];
}

export async function usage(ctx: OrgContext) {
  const monthStart = new Date();
  monthStart.setDate(1);
  const [{ count: parties }, { count: invoices }] = await Promise.all([
    ctx.supabase.from("parties").select("id", { count: "exact", head: true }).eq("org_id", ctx.org.id),
    ctx.supabase
      .from("documents")
      .select("id", { count: "exact", head: true })
      .eq("org_id", ctx.org.id)
      .in("type", ["factura_venta", "nota_credito_venta", "nota_debito_venta"])
      .gte("issue_date", monthStart.toISOString().slice(0, 10)),
  ]);
  return { parties: parties ?? 0, invoices: invoices ?? 0 };
}

/** Pending amount per document (debt still open, or amount not yet applied). */
export async function balancesFor(ctx: OrgContext, ids: string[]) {
  const map = new Map<string, number>();
  if (!ids.length) return map;
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await ctx.supabase.from("document_balances").select("id, pending").in("id", ids.slice(i, i + 200));
    for (const r of data ?? []) map.set(r.id, Number(r.pending));
  }
  return map;
}

/** Invoices/debit notes of a party that a credit/debit note can be associated with. */
export async function associableDocuments(ctx: OrgContext, partyId: string, side: "venta" | "compra") {
  const types = side === "venta" ? ["factura_venta", "nota_debito_venta"] : ["factura_compra", "nota_debito_compra"];
  const { data } = await ctx.supabase
    .from("documents")
    .select("id, type, letter, point_of_sale, number, issue_date, currency, fx_rate, total")
    .eq("org_id", ctx.org.id)
    .eq("party_id", partyId)
    .in("type", types)
    .in("status", ["issued", "authorized"])
    .order("issue_date", { ascending: false })
    .limit(100);
  return (data ?? []) as { id: string; type: DocType; letter: Letter | null; point_of_sale: number; number: number; issue_date: string; currency: string; fx_rate: number; total: number }[];
}
