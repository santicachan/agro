import "server-only";
import { createAdminClient } from "@/lib/supabase/server";
import { BCRA_SOURCE, fetchBcraRates, pickRate, type BcraRate } from "./bcra";
import type { OrgContext } from "@/lib/auth";

const addDays = (date: string, days: number) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Stores published rates in bcra_rates (service role; best effort). */
export async function storeBcraRates(rows: BcraRate[]) {
  const admin = createAdminClient();
  if (!admin || !rows.length) return;
  await admin.from("bcra_rates").upsert(
    rows.map((r) => ({ date: r.date, rate: r.rate, source: BCRA_SOURCE, fetched_at: new Date().toISOString() })),
    { onConflict: "date" },
  );
}

/**
 * Official BCRA rate (Com. A 3500) for a date: live from the BCRA API (and cached
 * in bcra_rates); if the API is down, the last stored rate on or before that day.
 */
export async function officialRate(supabase: Pick<OrgContext, "supabase">["supabase"], date: string): Promise<BcraRate | null> {
  const today = new Date().toISOString().slice(0, 10);
  const to = date > today ? today : date;
  const rows = await fetchBcraRates(addDays(to, -12), to).catch(() => [] as BcraRate[]);
  if (rows.length) {
    await storeBcraRates(rows).catch(() => undefined);
    const hit = pickRate(rows, to);
    if (hit) return hit;
  }
  const { data } = await supabase.from("bcra_rates").select("date, rate").lte("date", to).order("date", { ascending: false }).limit(1).maybeSingle();
  return data ? { date: data.date as string, rate: Number(data.rate) } : null;
}
