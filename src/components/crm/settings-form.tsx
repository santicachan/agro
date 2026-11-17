"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { saveSettings, type ActionState } from "@/lib/crm/actions";

export function SettingsForm({
  org,
}: {
  org: { name: string; tax_id: string | null; tax_condition: string | null; pointOfSale: number | null; environment: string };
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveSettings, {});
  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Razón social" htmlFor="name" className="sm:col-span-2">
          <Input id="name" name="name" defaultValue={org.name} required />
        </Field>
        <Field label="CUIT" htmlFor="tax_id" hint="Se valida el dígito verificador.">
          <Input id="tax_id" name="tax_id" inputMode="numeric" defaultValue={org.tax_id ?? ""} placeholder="30-12345678-9" />
        </Field>
        <Field label="Condición frente al IVA" htmlFor="tax_condition" hint="Define la letra de tus facturas (A/B o C).">
          <Select id="tax_condition" name="tax_condition" defaultValue={org.tax_condition ?? "RI"}>
            <option value="RI">Responsable Inscripto</option>
            <option value="MONO">Monotributista</option>
            <option value="EX">Exento</option>
          </Select>
        </Field>
        <Field label="Punto de venta (factura electrónica)" htmlFor="pointOfSale" hint="El punto de venta habilitado en ARCA para Web Services.">
          <Input id="pointOfSale" name="pointOfSale" type="number" min={1} max={99999} defaultValue={org.pointOfSale ?? 1} required />
        </Field>
        <Field label="Ambiente de ARCA" htmlFor="environment">
          <Select id="environment" name="environment" defaultValue={org.environment}>
            <option value="homologacion">Homologación (pruebas)</option>
            <option value="produccion">Producción</option>
          </Select>
        </Field>
      </div>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.ok ? <Alert>Configuración guardada.</Alert> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </form>
  );
}
