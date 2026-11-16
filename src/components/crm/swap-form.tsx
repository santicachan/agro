"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { createSwap, type ActionState } from "@/lib/crm/actions";
import { swapTons } from "@/lib/crm/documents";
import { formatNumber } from "@/lib/format";
import { CROPS, type Crop } from "@/lib/units";

export function SwapForm({ parties, referencePrices }: { parties: { id: string; name: string }[]; referencePrices: Partial<Record<Crop, { usd: number; label: string }>> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createSwap, {});
  const [crop, setCrop] = useState<Crop>("soja");
  const [price, setPrice] = useState(String(referencePrices.soja?.usd.toFixed(2) ?? ""));
  const [debt, setDebt] = useState("");
  const [tons, setTons] = useState("");
  const ref = referencePrices[crop];

  return (
    <form action={action} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Cliente" htmlFor="partyId" className="sm:col-span-2">
          <Select id="partyId" name="partyId" required>
            <option value="">Elegí…</option>
            {parties.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Grano" htmlFor="crop">
          <Select
            id="crop"
            name="crop"
            value={crop}
            onChange={(e) => {
              const c = e.target.value as Crop;
              setCrop(c);
              if (referencePrices[c]) setPrice(referencePrices[c]!.usd.toFixed(2));
            }}
          >
            {(Object.keys(CROPS) as Crop[]).map((c) => (
              <option key={c} value={c}>
                {CROPS[c].name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Precio pactado (USD/t)" htmlFor="priceUsdT" hint={ref ? `Referencia: ${ref.label} USD ${formatNumber(ref.usd, 2)}` : undefined}>
          <Input id="priceUsdT" name="priceUsdT" type="number" inputMode="decimal" step="any" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </Field>
        <Field label="Deuda a cancelar (USD)" htmlFor="debt" hint="Opcional: calcula las toneladas necesarias.">
          <Input
            id="debt"
            type="number"
            inputMode="decimal"
            step="any"
            value={debt}
            onChange={(e) => {
              setDebt(e.target.value);
              const t = swapTons(Number(e.target.value), Number(price));
              if (Number.isFinite(t)) setTons(String(t));
            }}
          />
        </Field>
        <Field label="Toneladas" htmlFor="tons">
          <Input id="tons" name="tons" type="number" inputMode="decimal" step="any" value={tons} onChange={(e) => setTons(e.target.value)} required />
        </Field>
        <Field label="Entrega desde" htmlFor="deliveryFrom">
          <Input id="deliveryFrom" name="deliveryFrom" type="date" />
        </Field>
        <Field label="Entrega hasta" htmlFor="deliveryTo">
          <Input id="deliveryTo" name="deliveryTo" type="date" />
        </Field>
      </div>
      <input type="hidden" name="referencePriceSource" value={ref?.label ?? ""} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando…" : "Registrar canje"}
      </Button>
    </form>
  );
}
