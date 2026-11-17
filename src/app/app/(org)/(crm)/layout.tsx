import { CrmUpsell } from "@/components/crm/crm-upsell";
import { requireOrg } from "@/lib/auth";

/** CRM routes are for paid plans. Free plans see the upsell instead. */
export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  const { plan } = await requireOrg();
  if (!plan.crm) return <CrmUpsell />;
  return children;
}
