"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { authenticate, type AuthState } from "./actions";

export function LoginForm({ next }: { next?: string }) {
  const [mode, setMode] = useState<"signin" | "signup" | "magic">("signin");
  const [state, action, pending] = useActionState<AuthState, FormData>(authenticate, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="next" value={next ?? ""} />
      <div className="grid grid-cols-3 gap-1 rounded-lg border bg-card p-1" role="tablist">
        {(
          [
            ["signin", "Ingresar"],
            ["signup", "Crear cuenta"],
            ["magic", "Link por email"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`h-10 rounded-md text-sm font-medium ${mode === m ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" autoComplete="email" required />
      </Field>
      {mode !== "magic" ? (
        <Field label="Contraseña" htmlFor="password" hint={mode === "signup" ? "Mínimo 8 caracteres" : undefined}>
          <Input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={8} />
        </Field>
      ) : null}
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}
      {state.message ? <Alert>{state.message}</Alert> : null}
      <Button type="submit" size="lg" className="w-full" disabled={pending}>
        {pending ? "Un momento…" : mode === "signup" ? "Crear cuenta gratis" : mode === "magic" ? "Enviarme el link" : "Ingresar"}
      </Button>
    </form>
  );
}
