import { redirect } from "next/navigation";
import { CrmUpsell } from "@/components/crm/crm-upsell";
import { requireOrg } from "@/lib/auth";

export const metadata = { title: "CRM para el agro" };

/** Upsell for free plans. Paid plans go straight to the CRM. */
export default async function UpgradePage() {
  const { plan } = await requireOrg();
  if (plan.crm) redirect("/app");
  return <CrmUpsell />;
}
