import "server-only";
import { usdCancelled } from "./fx-settlement";
import type { OrgContext } from "@/lib/auth";
import { CREDIT_TYPES, type DocType, type Letter, type TaxCondition } from "./documents";
import { balancesByLedger, movementAmountIn, rateOn, type FxPoint, type Ledger, type ViewCurrency } from "./ledger";

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
  ledger: Ledger;
  usd_rate: number | null;
  bcra_rate?: number | null;
  bcra_rate_date?: string | null;
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

/** Balances by party in base currency (positive = they owe us), optionally for one ledger. */
export async function partyBalances(ctx: OrgContext, ledger?: Ledger) {
  let q = ctx.supabase.from("account_movements").select("party_id, amount").eq("org_id", ctx.org.id);
  if (ledger) q = q.eq("ledger", ledger);
  const { data } = await q;
  const map = new Map<string, number>();
  for (const r of data ?? []) map.set(r.party_id, (map.get(r.party_id) ?? 0) + Number(r.amount));
  return map;
}

/** Balance per party split by ledger (base currency), with which ledgers each party uses. */
export async function partyLedgerBalances(ctx: OrgContext) {
  const { data } = await ctx.supabase.from("account_movements").select("party_id, ledger, amount").eq("org_id", ctx.org.id);
  return balancesByLedger((data ?? []).map((r) => ({ party_id: r.party_id, ledger: r.ledger === "gestion" ? "gestion" : "blanco", amount: Number(r.amount) })));
}

/** Published USD rates (fx_snapshots) to value old peso movements in dollars. */
export async function fxHistory(ctx: OrgContext): Promise<FxPoint[]> {
  const pair = ctx.org.base_currency === "BRL" ? "USD/BRL" : "USD/ARS";
  const { data } = await ctx.supabase.from("fx_snapshots").select("as_of, sell").eq("pair", pair).order("as_of").limit(5000);
  return (data ?? []).map((r) => ({ date: r.as_of as string, rate: Number(r.sell) }));
}

export interface LedgerMovement {
  party_id: string;
  ledger: Ledger;
  type: DocType;
  issue_date: string;
  currency: string;
  fx_rate: number;
  total: number;
  amount: number;
  usd_rate: number | null;
}

/** Every movement of the organization (both ledgers), for balances per ledger and currency. */
export async function ledgerMovements(ctx: OrgContext) {
  const rows: LedgerMovement[] = [];
  for (let page = 0; ; page++) {
    const { data } = await ctx.supabase
      .from("account_movements")
      .select("party_id, ledger, type, issue_date, currency, fx_rate, total, amount, usd_rate")
      .eq("org_id", ctx.org.id)
      .order("issue_date")
      .range(page * 1000, page * 1000 + 999);
    for (const r of data ?? [])
      rows.push({ ...r, ledger: r.ledger === "gestion" ? "gestion" : "blanco", fx_rate: Number(r.fx_rate), total: Number(r.total), amount: Number(r.amount), usd_rate: r.usd_rate == null ? null : Number(r.usd_rate) } as LedgerMovement);
    if (!data || data.length < 1000) break;
  }
  return rows;
}

/**
 * Converter to the view currency. `fallbackRate` (today's rate) is only used when
 * there is no published rate at all.
 */
export function currencyConverter(baseCurrency: string, view: ViewCurrency, history: FxPoint[], fallbackRate: number | null) {
  const rateFor = (date: string) => rateOn(history, date, fallbackRate);
  return (m: Pick<LedgerMovement, "type" | "issue_date" | "currency" | "fx_rate" | "total" | "amount" | "usd_rate">) => movementAmountIn(m, view, baseCurrency, rateFor);
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
  ledger: Ledger;
  usd_rate: number | null;
}

/**
 * Cuenta corriente of a party, oldest first, in base currency. With `from`, the
 * balance of earlier movements is returned as `opening` (saldo anterior).
 */
export async function accountStatement(ctx: OrgContext, partyId: string, range: { from?: string; to?: string } = {}, ledger?: Ledger) {
  let q = ctx.supabase
    .from("account_movements")
    .select("document_id, type, letter, point_of_sale, number, issue_date, due_date, currency, fx_rate, total, amount, concept, source_document_id, status, cae, created_at, ledger, usd_rate")
    .eq("org_id", ctx.org.id)
    .eq("party_id", partyId)
    .order("issue_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (ledger) q = q.eq("ledger", ledger);
  if (range.to) q = q.lte("issue_date", range.to);
  const { data } = await q;
  // Same day: documents that create debt (and remitos) before the ones that cancel it, so the
  // running balance never shows an artificial intermediate value (e.g. a receipt and the
  // exchange-difference note it generated share the same timestamp).
  const rank = (t: DocType) => (CREDIT_TYPES.includes(t) ? 2 : t === "remito" ? 1 : 0);
  const all = ((data ?? []).map((r) => ({ ...r, amount: Number(r.amount), total: Number(r.total), fx_rate: Number(r.fx_rate), usd_rate: r.usd_rate == null ? null : Number(r.usd_rate), ledger: r.ledger === "gestion" ? "gestion" : "blanco" })) as StatementRow[])
    .map((r, i) => ({ r, i }))
    .sort((a, b) => a.r.issue_date.localeCompare(b.r.issue_date) || rank(a.r.type) - rank(b.r.type) || a.i - b.i)
    .map(({ r }) => r);
  if (!range.from) return { opening: 0, rows: all };
  const opening = Math.round(all.filter((r) => r.issue_date < range.from!).reduce((s, r) => s + r.amount, 0) * 100) / 100;
  return { opening, rows: all.filter((r) => r.issue_date >= range.from!) };
}

export async function openItems(ctx: OrgContext, partyId: string, side: "venta" | "compra", ledger: Ledger = "blanco") {
  const types = side === "venta" ? ["factura_venta", "nota_debito_venta"] : ["factura_compra", "nota_debito_compra"];
  const { data } = await ctx.supabase
    .from("open_items")
    .select("*")
    .eq("org_id", ctx.org.id)
    .eq("party_id", partyId)
    .eq("ledger", ledger)
    .in("type", types)
    .gt("pending", 0)
    .order("issue_date");
  const rows = (data ?? []).map((r) => ({ ...r, pending: Number(r.pending), total: Number(r.total), vat: Number(r.vat), fx_rate: Number(r.fx_rate) })) as {
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
  const usd = await usdSettlementInfo(ctx, rows.map((r) => r.id));
  return rows.map((r) => ({ ...r, usd_rate: usd.get(r.id)?.usd_rate ?? null, usd_paid: usd.get(r.id)?.usd_paid ?? 0 }));
}

/**
 * Dollar side of peso invoices: the rate of the invoice day and the dollars
 * already cancelled (pesos applied ÷ rate of each payment). Exchange-difference
 * notes are adjustments, so they don't count as dollars paid.
 */
export async function usdSettlementInfo(ctx: OrgContext, ids: string[]) {
  const out = new Map<string, { usd_rate: number | null; usd_paid: number }>();
  if (!ids.length) return out;
  const [{ data: docs }, { data: apps }] = await Promise.all([
    ctx.supabase.from("documents").select("id, usd_rate, currency").in("id", ids).eq("org_id", ctx.org.id),
    ctx.supabase
      .from("applications")
      .select("invoice_document_id, amount, payer:documents!applications_payment_document_id_fkey(usd_rate, concept)")
      .in("invoice_document_id", ids)
      .eq("org_id", ctx.org.id),
  ]);
  for (const d of docs ?? []) {
    const rate = d.currency === ctx.org.base_currency && Number(d.usd_rate) > 0 ? Number(d.usd_rate) : null;
    const mine = (apps ?? []).filter((a) => a.invoice_document_id === d.id) as unknown as { amount: number; payer: { usd_rate: number | null; concept: string | null } | null }[];
    const paid = rate
      ? usdCancelled(
          mine.filter((a) => a.payer?.concept !== "diferencia_cambio").map((a) => ({ amount: Number(a.amount), paymentRate: a.payer?.usd_rate ? Number(a.payer.usd_rate) : null })),
          rate,
        )
      : 0;
    out.set(d.id as string, { usd_rate: rate, usd_paid: Math.round(paid * 100) / 100 });
  }
  return out;
}

export async function listDocuments(ctx: OrgContext, opts: { type?: string; partyId?: string; limit?: number; ledger?: Ledger } = {}) {
  let q = ctx.supabase
    .from("documents")
    .select("*, parties(name, tax_id, tax_condition)")
    .eq("org_id", ctx.org.id)
    .order("issue_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (opts.type) q = q.eq("type", opts.type);
  if (opts.partyId) q = q.eq("party_id", opts.partyId);
  if (opts.ledger) q = q.eq("ledger", opts.ledger);
  const { data } = await q;
  return (data ?? []) as DocumentRow[];
}

export async function chequesInPortfolio(ctx: OrgContext) {
  const { data } = await ctx.supabase
    .from("cheques")
    .select("id, bank, number, amount, payment_date, drawer_name, electronic, currency")
    .eq("org_id", ctx.org.id)
    .eq("status", "en_cartera")
    .order("payment_date");
  return (data ?? []) as { id: string; bank: string; number: string; amount: number; payment_date: string; drawer_name: string | null; electronic: boolean; currency: string | null }[];
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
export async function associableDocuments(ctx: OrgContext, partyId: string, side: "venta" | "compra", ledger: Ledger = "blanco") {
  const types = side === "venta" ? ["factura_venta", "nota_debito_venta"] : ["factura_compra", "nota_debito_compra"];
  const { data } = await ctx.supabase
    .from("documents")
    .select("id, type, letter, point_of_sale, number, issue_date, currency, fx_rate, total")
    .eq("org_id", ctx.org.id)
    .eq("party_id", partyId)
    .eq("ledger", ledger)
    .in("type", types)
    .in("status", ["issued", "authorized"])
    .order("issue_date", { ascending: false })
    .limit(100);
  return (data ?? []) as { id: string; type: DocType; letter: Letter | null; point_of_sale: number; number: number; issue_date: string; currency: string; fx_rate: number; total: number }[];
}
