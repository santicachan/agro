import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getPayment, getSubscription } from "@/lib/billing/mercadopago";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Verifies the x-signature header (HMAC-SHA256 of "id:<id>;request-id:<rid>;ts:<ts>;"). */
function validSignature(req: Request, dataId: string) {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return false;
  const sig = req.headers.get("x-signature") ?? "";
  const requestId = req.headers.get("x-request-id") ?? "";
  const parts = Object.fromEntries(sig.split(",").map((p) => p.trim().split("=") as [string, string]));
  if (!parts.ts || !parts.v1) return false;
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${parts.ts};`;
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  return expected.length === parts.v1.length && timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
}

/**
 * Never trusts the notification body: it re-fetches the resource from the
 * Mercado Pago API before changing plans or activating boosts.
 */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const body = (await req.json().catch(() => ({}))) as { type?: string; data?: { id?: string } };
  const type = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const id = body.data?.id ?? url.searchParams.get("data.id") ?? url.searchParams.get("id");
  if (!id || !type) return NextResponse.json({ ignored: true });
  if (!validSignature(req, id)) return NextResponse.json({ error: "invalid signature" }, { status: 401 });

  const sb = createAdminClient();
  if (!sb) return NextResponse.json({ error: "not configured" }, { status: 500 });

  if (type === "subscription_preapproval" || type === "preapproval") {
    const sub = await getSubscription(id);
    const [kind, orgId, planId] = sub.external_reference.split(":");
    if (kind !== "plan") return NextResponse.json({ ignored: true });
    const active = sub.status === "authorized";
    await sb.from("subscriptions").upsert(
      {
        org_id: orgId,
        plan_id: planId,
        status: active ? "active" : sub.status === "paused" ? "past_due" : "canceled",
        provider: "mercadopago",
        provider_ref: sub.id,
        current_period_end: sub.next_payment_date ?? null,
      },
      { onConflict: "provider_ref" },
    );
    await sb.from("organizations").update({ plan_id: active ? planId : "free" }).eq("id", orgId);
  } else if (type === "payment") {
    const payment = await getPayment(id);
    const [kind, boostId] = payment.external_reference.split(":");
    if (kind === "boost" && payment.status === "approved") {
      const { data: boost } = await sb.from("listing_boosts").update({ status: "paid", provider_ref: String(payment.id) }).eq("id", boostId).eq("status", "pending").select("listing_id, days").maybeSingle();
      if (boost) {
        const { data: listing } = await sb.from("listings").select("featured_until").eq("id", boost.listing_id).single();
        const from = listing?.featured_until && new Date(listing.featured_until) > new Date() ? new Date(listing.featured_until) : new Date();
        from.setDate(from.getDate() + boost.days);
        await sb.from("listings").update({ featured_until: from.toISOString() }).eq("id", boost.listing_id);
      }
    }
  }
  return NextResponse.json({ ok: true });
}
