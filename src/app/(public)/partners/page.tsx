import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { buildMetadata } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = buildMetadata({
  title: "Partners y marca blanca",
  description: "Ofrecé gestión comercial, precios y calculadoras agro con tu propia marca. Programa de partners para software houses, acopios y cooperativas.",
  path: "/partners",
});

const BENEFITS = [
  "Tu dominio, tu logo y tus colores",
  "Mismo producto, actualizaciones automáticas",
  "Revenue share sobre las suscripciones de tus clientes",
  "Precios, calculadoras y marketplace incluidos",
  "Facturación electrónica ARCA y API",
  "Soporte técnico de segundo nivel",
];

export default function PartnersPage() {
  return (
    <>
      <PageHeader title="Marca blanca para partners" description="Para empresas de software agro, acopios, cooperativas y consultoras que quieren ofrecer su propia plataforma." />
      <div className="grid gap-6 md:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="pt-5">
            <ul className="grid gap-3 sm:grid-cols-2">
              {BENEFITS.map((b) => (
                <li key={b} className="flex gap-2">
                  <Check className="mt-0.5 size-5 shrink-0 text-success" aria-hidden /> {b}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="font-semibold">Hablemos</p>
            <p className="text-sm text-muted-foreground">Contanos cuántos clientes tenés y en qué países operás.</p>
            <Button asChild size="lg" className="w-full">
              <a href={`mailto:${site.supportEmail}?subject=${encodeURIComponent("Partner marca blanca")}`}>Escribinos</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
