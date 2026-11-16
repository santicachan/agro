import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { REGIONS } from "@/lib/regions";
import { TAX_CONDITIONS } from "@/lib/crm/documents";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

// Always per-request: depends on the session cookie.
export const dynamic = "force-dynamic";

async function createOrg(formData: FormData) {
  "use server";
  const supabase = await createClient();
  const name = String(formData.get("name") ?? "").trim();
  const taxId = String(formData.get("tax_id") ?? "").trim();
  const region = String(formData.get("region") ?? "AR");
  const taxCondition = String(formData.get("tax_condition") ?? "RI");
  if (!name) redirect("/app/onboarding?error=name");
  const { data: orgId, error } = await supabase.rpc("create_organization", { p_name: name, p_tax_id: taxId || null, p_region: region });
  if (error) redirect(`/app/onboarding?error=${encodeURIComponent(error.message)}`);
  await supabase.from("organizations").update({ tax_condition: taxCondition }).eq("id", orgId);
  redirect("/app");
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (!isSupabaseConfigured()) redirect("/app/configurar");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/ingresar?next=/app/onboarding");
  const { error } = await searchParams;
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Contanos de tu empresa</CardTitle>
          <CardDescription>Un solo paso y empezás a usar el sistema.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createOrg} className="space-y-4">
            <Field label="Nombre o razón social" htmlFor="name">
              <Input id="name" name="name" required placeholder="Ej: Agropecuaria La Esperanza SA" />
            </Field>
            <Field label="País" htmlFor="region">
              <Select id="region" name="region" defaultValue="AR">
                {Object.values(REGIONS).map((r) => (
                  <option key={r.code} value={r.code}>
                    {r.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="CUIT / CNPJ / RUT" htmlFor="tax_id" hint="Opcional ahora, necesario para facturar electrónicamente.">
              <Input id="tax_id" name="tax_id" inputMode="numeric" placeholder="30-12345678-9" />
            </Field>
            <Field label="Condición frente al IVA" htmlFor="tax_condition">
              <Select id="tax_condition" name="tax_condition" defaultValue="RI">
                {Object.entries(TAX_CONDITIONS)
                  .filter(([k]) => k !== "CF")
                  .map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
              </Select>
            </Field>
            {error ? <Alert tone="error">No pudimos crear la empresa: {error}</Alert> : null}
            <Button type="submit" size="lg" className="w-full">
              Empezar
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
