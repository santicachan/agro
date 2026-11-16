"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { sendInquiry, type FormState } from "@/lib/marketplace/actions";

export function InquiryForm({ listingId }: { listingId: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(sendInquiry, {});
  if (state.ok) return <Alert>¡Listo! El vendedor recibió tu consulta y te va a contactar.</Alert>;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="listingId" value={listingId} />
      <input type="text" name="website" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden />
      <Field label="Nombre" htmlFor="iq-name">
        <Input id="iq-name" name="name" required autoComplete="name" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Teléfono / WhatsApp" htmlFor="iq-phone">
          <Input id="iq-phone" name="phone" type="tel" autoComplete="tel" />
        </Field>
        <Field label="Email" htmlFor="iq-email">
          <Input id="iq-email" name="email" type="email" autoComplete="email" />
        </Field>
      </div>
      <Field label="Consulta" htmlFor="iq-msg">
        <Textarea id="iq-msg" name="message" required defaultValue="Hola, ¿sigue disponible?" />
      </Field>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Enviando…" : "Contactar al vendedor"}
      </Button>
    </form>
  );
}
