import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { ListingForm } from "@/components/marketplace/listing-form";
import { requireOrg } from "@/lib/auth";

export const metadata = { title: "Nueva publicación" };

export default async function NewListingPage() {
  const { supabase, org } = await requireOrg();
  const { data: v } = await supabase.from("seller_verifications").select("status").eq("org_id", org.id).maybeSingle();
  return (
    <>
      <PageHeader title="Nueva publicación" description="Publicar es gratis dentro del límite de tu plan." />
      <Card>
        <CardContent className="pt-5">
          <ListingForm verified={v?.status === "verified"} />
        </CardContent>
      </Card>
    </>
  );
}
