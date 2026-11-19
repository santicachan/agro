import "server-only";
import type { OrgContext } from "@/lib/auth";

/** Orders count as a closed deal once paid; listings marked "vendida" too. */
export const DEAL_STATUSES = ["paid", "shipped", "completed"] as const;
export const DEAL_STATUS_LABEL: Record<string, string> = {
  paid: "Pagado",
  shipped: "Enviado",
  completed: "Completado",
  sold: "Vendida",
};

export interface Deal {
  id: string;
  role: "venta" | "compra";
  title: string;
  slug: string | null;
  amount: number | null;
  currency: string;
  quantity: number | null;
  commission: number | null;
  status: string;
  date: string;
}

type OrderRow = {
  id: string;
  amount: number;
  currency: string;
  quantity: number;
  commission_amount: number;
  status: string;
  created_at: string;
  seller_org_id: string;
  buyer_user_id: string;
  listings: { title: string; slug: string } | null;
};

/** Deals closed through the marketplace: our sales, our purchases and listings marked as sold. */
export async function completedDeals(ctx: OrgContext): Promise<{ rows: Deal[]; totals: Record<string, { ventas: number; compras: number }> }> {
  const select = "id, amount, currency, quantity, commission_amount, status, created_at, seller_org_id, buyer_user_id, listings(title, slug)";
  const [sales, purchases, sold] = await Promise.all([
    ctx.supabase.from("marketplace_orders").select(select).eq("seller_org_id", ctx.org.id).in("status", [...DEAL_STATUSES]).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("marketplace_orders").select(select).eq("buyer_user_id", ctx.user.id).in("status", [...DEAL_STATUSES]).order("created_at", { ascending: false }).limit(200),
    ctx.supabase.from("listings").select("id, title, slug, price, currency, created_at").eq("org_id", ctx.org.id).eq("status", "sold").order("created_at", { ascending: false }).limit(200),
  ]);
  const rows: Deal[] = [];
  const seen = new Set<string>();
  const soldWithOrder = new Set<string>();
  for (const [data, role] of [
    [sales.data, "venta"],
    [purchases.data, "compra"],
  ] as const) {
    for (const o of (data ?? []) as unknown as OrderRow[]) {
      if (seen.has(o.id)) continue;
      seen.add(o.id);
      if (role === "venta" && o.listings?.slug) soldWithOrder.add(o.listings.slug);
      rows.push({
        id: o.id,
        role,
        title: o.listings?.title ?? "Publicación",
        slug: o.listings?.slug ?? null,
        amount: Number(o.amount),
        currency: o.currency,
        quantity: Number(o.quantity),
        commission: role === "venta" ? Number(o.commission_amount) : null,
        status: o.status,
        date: o.created_at,
      });
    }
  }
  for (const l of (sold.data ?? []) as { id: string; title: string; slug: string; price: number | null; currency: string; created_at: string }[]) {
    if (soldWithOrder.has(l.slug)) continue;
    rows.push({ id: `listing-${l.id}`, role: "venta", title: l.title, slug: l.slug, amount: l.price == null ? null : Number(l.price), currency: l.currency, quantity: null, commission: null, status: "sold", date: l.created_at });
  }
  rows.sort((a, b) => b.date.localeCompare(a.date));
  const totals: Record<string, { ventas: number; compras: number }> = {};
  for (const r of rows) {
    if (r.amount == null) continue;
    const t = (totals[r.currency] ??= { ventas: 0, compras: 0 });
    if (r.role === "venta") t.ventas += r.amount;
    else t.compras += r.amount;
  }
  return { rows, totals };
}
