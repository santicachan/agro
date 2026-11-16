"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { saveParty, type ActionState } from "@/lib/crm/actions";
import { TAX_CONDITIONS } from "@/lib/crm/documents";
import type { PartyRow } from "@/lib/crm/queries";

export function PartyForm({ kind, party, taxIdLabel }: { kind: "customer" | "supplier"; party?: PartyRow | null; taxIdLabel: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveParty, {});
  return (
    <form action={action} className="space-y-4">
      {party ? <input type="hidden" name="id" value={party.id} /> : null}
      <input type="hidden" name="kind" value={party?.kind ?? kind} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre o razón social" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" required defaultValue={party?.name} autoFocus />
        </Field>
        <Field label={taxIdLabel} htmlFor="tax_id">
          <Input id="tax_id" name="tax_id" inputMode="numeric" defaultValue={party?.tax_id ?? ""} />
        </Field>
        <Field label="Condición IVA" htmlFor="tax_condition">
          <Select id="tax_condition" name="tax_condition" defaultValue={party?.tax_condition ?? "RI"}>
            {Object.entries(TAX_CONDITIONS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Teléfono / WhatsApp" htmlFor="phone">
          <Input id="phone" name="phone" type="tel" defaultValue={party?.phone ?? ""} />
        </Field>
        <Field label="Email" htmlFor="email">
          <Input id="email" name="email" type="email" defaultValue={party?.email ?? ""} />
        </Field>
        <Field label="Dirección" htmlFor="address">
          <Input id="address" name="address" defaultValue={party?.address ?? ""} />
        </Field>
        <Field label="Localidad" htmlFor="city">
          <Input id="city" name="city" defaultValue={party?.city ?? ""} />
        </Field>
        <Field label="Provincia" htmlFor="province">
          <Input id="province" name="province" defaultValue={party?.province ?? ""} />
        </Field>
        <Field label="Notas" htmlFor="notes" className="sm:col-span-2">
          <Textarea id="notes" name="notes" defaultValue={party?.notes ?? ""} />
        </Field>
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
