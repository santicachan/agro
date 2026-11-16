import { NextResponse } from "next/server";
import { getPriceBoard } from "@/lib/prices";
import { createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Vercel Cron (see vercel.json): stores a daily snapshot of every quote so we can
 * chart history for sources that don't expose it (BCR, CEPEA) and fall back
 * when a source is down.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const sb = createAdminClient();
  if (!sb) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not configured" }, { status: 500 });

  const board = await getPriceBoard();
  const live = board.quotes.filter((q) => !q.stale);
  const { error: e1 } = await sb.from("price_snapshots").upsert(
    live.map((q) => ({
      key: q.key,
      as_of: q.asOf,
      market: q.market,
      crop: q.crop,
      label: q.label,
      price: q.price,
      currency: q.currency,
      unit: q.unit,
      usd_per_ton: q.usdPerTon,
      estimated: q.estimated,
      source: q.source,
      source_url: q.sourceUrl,
    })),
  );
  const { error: e2 } = await sb.from("fx_snapshots").upsert(
    board.fx.map((f) => ({ pair: f.pair, as_of: f.asOf.slice(0, 10), buy: f.buy, sell: f.sell, source: f.source })),
  );
  const errors = [...board.errors.map((e) => `${e.source}: ${e.message}`), e1?.message, e2?.message].filter(Boolean);
  return NextResponse.json({ saved: live.length, fx: board.fx.length, errors }, { status: errors.length && !live.length ? 502 : 200 });
}
