import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getPlan, type Plan } from "@/lib/billing/plans";
import { getRegion, type Region } from "@/lib/regions";
import type { TaxCondition } from "@/lib/crm/documents";

export interface Organization {
  id: string;
  name: string;
  tax_id: string | null;
  tax_condition: TaxCondition | null;
  region: string;
  base_currency: string;
  plan_id: string;
  arca_config: { pointOfSale?: number } | null;
}

export interface OrgContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email?: string };
  org: Organization;
  role: "owner" | "admin" | "member" | "viewer";
  plan: Plan;
  region: Region;
}

export const getUser = cache(async () => {
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

/** Loads the active organization for the signed-in user, redirecting as needed. */
export const requireOrg = cache(async (): Promise<OrgContext> => {
  if (!isSupabaseConfigured()) redirect("/app/configurar");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar?next=/app");

  const { data: profile } = await supabase.from("profiles").select("current_org_id").eq("id", user.id).maybeSingle();
  let query = supabase.from("memberships").select("role, organizations(*)").eq("user_id", user.id);
  if (profile?.current_org_id) query = query.eq("org_id", profile.current_org_id);
  const { data: memberships } = await query.limit(1);
  const m = memberships?.[0] as unknown as { role: OrgContext["role"]; organizations: Organization } | undefined;
  if (!m?.organizations) redirect("/app/onboarding");

  return {
    supabase,
    user: { id: user.id, email: user.email },
    org: m.organizations,
    role: m.role,
    plan: getPlan(m.organizations.plan_id),
    region: getRegion(m.organizations.region),
  };
});

/** Like requireOrg, but for CRM features: free plans are sent to the upsell screen. */
export async function requireCrm(): Promise<OrgContext> {
  const ctx = await requireOrg();
  if (!ctx.plan.crm) redirect("/app");
  return ctx;
}
