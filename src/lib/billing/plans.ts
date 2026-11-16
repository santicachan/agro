/** Plans — keep in sync with supabase/seed.sql (DB is the enforcement source of truth). */
export type PlanId = "free" | "basic" | "pro" | "enterprise";

export interface Plan {
  id: PlanId;
  name: string;
  priceUsdMonth: number;
  maxCustomers: number | null;
  maxInvoicesMonth: number | null;
  maxUsers: number | null;
  maxListings: number | null;
  commissionPct: number;
  highlight?: boolean;
  features: string[];
}

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Gratis",
    priceUsdMonth: 0,
    maxCustomers: 25,
    maxInvoicesMonth: 20,
    maxUsers: 1,
    maxListings: 3,
    commissionPct: 8,
    features: ["Precios y calculadoras", "Hasta 25 clientes/proveedores", "20 comprobantes por mes", "3 publicaciones en marketplace"],
  },
  {
    id: "basic",
    name: "Basic",
    priceUsdMonth: 19,
    maxCustomers: 250,
    maxInvoicesMonth: 200,
    maxUsers: 3,
    maxListings: 15,
    commissionPct: 6,
    features: ["Todo lo de Gratis", "250 clientes/proveedores", "200 comprobantes por mes", "Cheques en cartera y canjes", "3 usuarios"],
  },
  {
    id: "pro",
    name: "Pro",
    priceUsdMonth: 49,
    maxCustomers: null,
    maxInvoicesMonth: 2000,
    maxUsers: 10,
    maxListings: 60,
    commissionPct: 4,
    highlight: true,
    features: ["Todo lo de Basic", "Clientes ilimitados", "Factura electrónica ARCA", "Diferencia de cambio automática", "Alertas de precios", "Comisión marketplace 4%"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceUsdMonth: 199,
    maxCustomers: null,
    maxInvoicesMonth: null,
    maxUsers: null,
    maxListings: null,
    commissionPct: 3,
    features: ["Todo lo de Pro", "Comprobantes y usuarios ilimitados", "Marca blanca para partners", "API y soporte dedicado", "Comisión marketplace 3%"],
  },
];

export const FEATURED_LISTING_PRICES = [
  { days: 7, priceUsd: 9 },
  { days: 30, priceUsd: 29 },
];

export function getPlan(id: string | null | undefined): Plan {
  return PLANS.find((p) => p.id === id) ?? PLANS[0];
}

export function usagePct(used: number, limit: number | null): number | null {
  return limit == null ? null : Math.min(100, Math.round((used / limit) * 100));
}

/** Turns DB trigger errors ("PLAN_LIMIT: ...") into a friendly message. */
export function friendlyDbError(message: string | undefined | null): string {
  if (!message) return "Ocurrió un error. Intentá de nuevo.";
  const m = message.match(/(PLAN_LIMIT|VERIFICATION_REQUIRED):\s*(.*)/);
  if (m) return m[1] === "PLAN_LIMIT" ? `${m[2]}. Pasate a un plan superior para seguir.` : m[2];
  if (message.includes("duplicate key")) return "Ya existe un registro con esos datos.";
  return message;
}

/** Marketplace commission for a sale. */
export function commission(amount: number, planId: string): { pct: number; amount: number } {
  const pct = getPlan(planId).commissionPct;
  return { pct, amount: Math.round(amount * pct) / 100 };
}
