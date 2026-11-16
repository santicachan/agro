"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { requestVerification, type FormState } from "@/lib/marketplace/actions";

export function VerificationForm({ defaultTaxId }: { defaultTaxId?: string | null }) {
  const [state, action, pending] = useActionState<FormState, FormData>(requestVerification, {});
  if (state.ok) return <Alert>Recibimos tu solicitud. Te avisamos cuando esté aprobada.</Alert>;
  return (
    <form action={action} className="space-y-3">
      <Field label="CUIT" htmlFor="v-tax">
        <Input id="v-tax" name="tax_id" defaultValue={defaultTaxId ?? ""} required />
      </Field>
      <Field label="Nº de inscripción como expendedor de agroquímicos" htmlFor="v-lic" hint="Requerido solo para vender agroquímicos.">
        <Input id="v-lic" name="agrochem_license" />
      </Field>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" disabled={pending}>
        Solicitar verificación
      </Button>
    </form>
  );
}
