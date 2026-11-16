"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { CATEGORIES } from "@/lib/marketplace/categories";
import { createListing, type FormState } from "@/lib/marketplace/actions";

export function ListingForm({ verified }: { verified: boolean }) {
  const [state, action, pending] = useActionState<FormState, FormData>(createListing, {});
  return (
    <form action={action} className="space-y-4">
      <Field label="Categoría" htmlFor="category_slug" hint={verified ? undefined : "Agroquímicos requiere vendedor verificado."}>
        <Select id="category_slug" name="category_slug" required defaultValue="">
          <option value="" disabled>
            Elegí…
          </option>
          {CATEGORIES.filter((c) => c.parent || c.slug === "servicios").map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.parent ? `${CATEGORIES.find((p) => p.slug === c.parent)?.name} › ` : ""}
              {c.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Título" htmlFor="title">
        <Input id="title" name="title" required placeholder="Ej: Tractor John Deere 6125J 2019" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Precio" htmlFor="price" hint="Vacío = consultar">
          <Input id="price" name="price" type="number" inputMode="decimal" step="any" />
        </Field>
        <Field label="Moneda" htmlFor="currency">
          <Select id="currency" name="currency" defaultValue="USD">
            <option>USD</option>
            <option>ARS</option>
            <option>BRL</option>
          </Select>
        </Field>
        <Field label="Unidad" htmlFor="unit" hint="Ej: bidón 20 L, t, unidad">
          <Input id="unit" name="unit" />
        </Field>
        <Field label="Estado" htmlFor="condition">
          <Select id="condition" name="condition" defaultValue="nuevo">
            <option value="nuevo">Nuevo</option>
            <option value="usado">Usado</option>
            <option value="reacondicionado">Reacondicionado</option>
          </Select>
        </Field>
        <Field label="Marca" htmlFor="brand">
          <Input id="brand" name="brand" />
        </Field>
        <Field label="Modelo" htmlFor="model">
          <Input id="model" name="model" />
        </Field>
        <Field label="Año" htmlFor="year">
          <Input id="year" name="year" type="number" inputMode="numeric" />
        </Field>
        <Field label="Localidad" htmlFor="city">
          <Input id="city" name="city" />
        </Field>
        <Field label="Provincia" htmlFor="province">
          <Input id="province" name="province" />
        </Field>
      </div>
      <Field label="Descripción" htmlFor="description">
        <Textarea id="description" name="description" rows={6} />
      </Field>
      <Field label="Fotos (hasta 6, máx. 4 MB en total)" htmlFor="images">
        <Input id="images" name="images" type="file" accept="image/*" multiple className="py-2" />
      </Field>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? "Publicando…" : "Publicar"}
      </Button>
    </form>
  );
}
