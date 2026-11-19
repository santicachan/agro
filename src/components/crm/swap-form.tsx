"use client";

import { useActionState, useState } from "react";
import { Truck, Package, Wheat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { createSwap, type ActionState } from "@/lib/crm/actions";
import { swapTons } from "@/lib/crm/documents";
import { formatNumber } from "@/lib/format";
import { CROPS, type Crop } from "@/lib/units";
import { cn } from "@/lib/utils";

type Kind = "granos" | "camioneta" | "insumos";
const KINDS: { value: Kind; label: string; icon: typeof Wheat; hint: string }[] = [
  { value: "granos", label: "Granos", icon: Wheat, hint: "Toneladas a precio pactado" },
  { value: "camioneta", label: "Camioneta", icon: Truck, hint: "Vehículo a valor acordado" },
  { value: "insumos", label: "Insumos", icon: Package, hint: "Productos a precio unitario" },
];

export function SwapForm({ parties, referencePrices }: { parties: { id: string; name: string }[]; referencePrices: Partial<Record<Crop, { usd: number; label: string }>> }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(createSwap, {});
  const [kind, setKind] = useState<Kind>("granos");
  const [crop, setCrop] = useState<Crop>("soja");
  const [price, setPrice] = useState(String(referencePrices.soja?.usd.toFixed(2) ?? ""));
  const [debt, setDebt] = useState("");
  const [tons, setTons] = useState("");
  const [unit, setUnit] = useState("u");
  const ref = referencePrices[crop];
  const grains = kind === "granos";
  const total = (Number(tons) || 0) * (Number(price) || 0);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="kind" value={kind} />
      <fieldset>
        <legend className="mb-2 text-sm font-medium">¿Con qué se paga?</legend>
        <div className="grid grid-cols-3 gap-2">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              onClick={() => {
                setKind(k.value);
                if (k.value === "camioneta") {
                  setTons("1");
                  setPrice("");
                } else if (k.value === "granos") {
                  setTons("");
                  setPrice(referencePrices[crop]?.usd.toFixed(2) ?? "");
                } else {
                  setTons("");
                  setPrice("");
                }
              }}
              aria-pressed={kind === k.value}
              className={cn(
                "flex min-h-20 flex-col items-center justify-center gap-1 rounded-lg border p-2 text-center text-sm",
                kind === k.value ? "border-primary bg-primary/5 font-semibold ring-1 ring-primary" : "hover:bg-muted",
              )}
            >
              <k.icon className="size-5" aria-hidden />
              {k.label}
              <span className="text-xs font-normal text-muted-foreground">{k.hint}</span>
            </button>
          ))}
        </div>
      </fieldset>
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
        {grains ? (
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
        ) : (
          <Field label={kind === "camioneta" ? "Camioneta (marca, modelo, año, dominio)" : "Insumos (producto y presentación)"} htmlFor="description" className="sm:col-span-2">
            <Input id="description" name="description" required placeholder={kind === "camioneta" ? "Ej: Toyota Hilux SRV 2021, AB123CD" : "Ej: Glifosato 66,2% bidón 20 L"} />
          </Field>
        )}
        <Field
          label={grains ? "Precio pactado (USD/t)" : kind === "camioneta" ? "Valor acordado (USD)" : "Precio unitario (USD)"}
          htmlFor="priceUsdT"
          hint={grains && ref ? `Referencia: ${ref.label} USD ${formatNumber(ref.usd, 2)}` : undefined}
        >
          <Input id="priceUsdT" name="priceUsdT" type="number" inputMode="decimal" step="any" value={price} onChange={(e) => setPrice(e.target.value)} required />
        </Field>
        <Field label="Deuda a cancelar (USD)" htmlFor="debt" hint={grains ? "Opcional: calcula las toneladas necesarias." : "Opcional: calcula la cantidad necesaria."}>
          <Input
            id="debt"
            type="number"
            inputMode="decimal"
            step="any"
            value={debt}
            onChange={(e) => {
              setDebt(e.target.value);
              const t = swapTons(Number(e.target.value), Number(price));
              if (kind !== "camioneta" && Number.isFinite(t)) setTons(String(t));
            }}
          />
        </Field>
        {kind === "camioneta" ? (
          <input type="hidden" name="tons" value="1" />
        ) : (
          <Field label={grains ? "Toneladas" : "Cantidad"} htmlFor="tons">
            <Input id="tons" name="tons" type="number" inputMode="decimal" step="any" value={tons} onChange={(e) => setTons(e.target.value)} required />
          </Field>
        )}
        {kind === "insumos" ? (
          <Field label="Unidad" htmlFor="unit">
            <Select id="unit" name="unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
              {["u", "L", "kg", "bolsa", "bidón", "t"].map((u) => (
                <option key={u}>{u}</option>
              ))}
            </Select>
          </Field>
        ) : null}
        <Field label={kind === "camioneta" ? "Entrega" : "Entrega desde"} htmlFor="deliveryFrom">
          <Input id="deliveryFrom" name="deliveryFrom" type="date" />
        </Field>
        {kind === "camioneta" ? null : (
          <Field label="Entrega hasta" htmlFor="deliveryTo">
            <Input id="deliveryTo" name="deliveryTo" type="date" />
          </Field>
        )}
      </div>
      {total > 0 ? <p className="text-sm text-muted-foreground">Total del canje: USD {formatNumber(total, 2)}</p> : null}
      <input type="hidden" name="referencePriceSource" value={grains ? (ref?.label ?? "") : ""} />
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Guardando…" : "Registrar canje"}
      </Button>
    </form>
  );
}
