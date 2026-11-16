import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata = { title: "Configurar", robots: { index: false } };

/** Shown when the deployment has no Supabase env vars (public pages still work). */
export default function ConfigurePage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle>Falta conectar la base de datos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-muted-foreground">
          <p>El módulo de gestión necesita Supabase. Definí estas variables de entorno y aplicá las migraciones de <code>supabase/migrations</code>:</p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 text-sm text-foreground">
            NEXT_PUBLIC_SUPABASE_URL=...{"\n"}NEXT_PUBLIC_SUPABASE_ANON_KEY=...{"\n"}SUPABASE_SERVICE_ROLE_KEY=...
          </pre>
          <p>Mientras tanto, los precios y las calculadoras funcionan sin registro.</p>
          <Button asChild>
            <Link href="/precios">Ver precios</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
