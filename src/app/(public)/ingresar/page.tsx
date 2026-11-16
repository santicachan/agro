import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/misc";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Ingresar", robots: { index: false } };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return (
    <div className="mx-auto max-w-md py-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Tu campo, ordenado</CardTitle>
          <CardDescription>Creá tu cuenta gratis. No necesitás tarjeta.</CardDescription>
        </CardHeader>
        <CardContent>
          {isSupabaseConfigured() ? (
            <LoginForm next={next} />
          ) : (
            <Alert tone="warning">Este entorno no tiene Supabase configurado. Definí NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY.</Alert>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
