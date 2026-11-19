"use server";

import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { absoluteUrl } from "@/lib/site";
import { fetchFx } from "@/lib/prices/sources/fx";
import { FEATURED_LISTING_PRICES, getPlan } from "./plans";
import { createPayment, createSubscription, isMercadoPagoConfigured } from "./mercadopago";

async function localAmount(usd: number, currency: string) {
  if (currency === "USD") return usd;
  const fx = await fetchFx();
  const rate = fx.items.find((f) => f.pair === `USD/${currency}`)?.sell;
  if (!rate) throw new Error("No pudimos obtener el tipo de cambio. Intentá más tarde.");
  return usd * rate;
}

export async function startCheckout(planId: string) {
  const { org, user, role } = await requireOrg();
  const plan = getPlan(planId);
  if (!["owner", "admin"].includes(role)) redirect("/app/plan?error=permisos");
  if (plan.id === "enterprise") redirect("/partners");
  if (plan.priceUsdMonth === 0 || !isMercadoPagoConfigured()) redirect(`/app/plan?error=${encodeURIComponent("Los pagos online no están habilitados todavía. Escribinos y te activamos el plan.")}`);
  let url: string;
  try {
    const sub = await createSubscription({
      reason: `CAMPAGROX ${plan.name}`,
      amount: await localAmount(plan.priceUsdMonth, org.base_currency),
      currency: org.base_currency,
      payerEmail: user.email ?? "",
      backUrl: absoluteUrl("/app/plan?ok=1"),
      externalReference: `plan:${org.id}:${plan.id}`,
    });
    url = sub.init_point;
  } catch (e) {
    redirect(`/app/plan?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(url);
}

export async function startBoostCheckout(listingId: string, days: number) {
  const { supabase, org } = await requireOrg();
  const option = FEATURED_LISTING_PRICES.find((p) => p.days === days);
  if (!option) redirect("/app/publicaciones");
  if (!isMercadoPagoConfigured()) redirect(`/app/publicaciones?error=${encodeURIComponent("Los pagos online no están habilitados todavía.")}`);
  const { data: boost, error } = await supabase
    .from("listing_boosts")
    .insert({ listing_id: listingId, org_id: org.id, days, amount_usd: option.priceUsd })
    .select("id")
    .single();
  if (error || !boost) redirect(`/app/publicaciones?error=${encodeURIComponent(error?.message ?? "error")}`);
  let url: string;
  try {
    const pref = await createPayment({
      title: `Publicación destacada ${days} días`,
      amount: await localAmount(option.priceUsd, org.base_currency),
      currency: org.base_currency,
      externalReference: `boost:${boost.id}`,
      backUrl: absoluteUrl("/app/publicaciones?ok=1"),
      notificationUrl: absoluteUrl("/api/webhooks/mercadopago"),
    });
    url = pref.init_point;
  } catch (e) {
    redirect(`/app/publicaciones?error=${encodeURIComponent((e as Error).message)}`);
  }
  redirect(url);
}
