import Link from "next/link";
import { Calculator } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { CALCULATORS } from "@/lib/calculators/registry";
import { buildMetadata } from "@/lib/seo";

export const metadata = buildMetadata({
  title: "Calculadoras agrícolas gratis",
  description: "Calculadoras agro gratuitas: margen bruto, densidad de siembra, merma por humedad, costo por hectárea, fertilización NPK, pulverización y conversor de unidades.",
  path: "/calculadoras",
  keywords: ["calculadoras agro", "calculadora agrícola", "calculagro", "calculadora margen bruto"],
});

export default function CalculadorasPage() {
  return (
    <>
      <PageHeader title="Calculadoras agrícolas" description="Gratis, sin registro y pensadas para usar desde el celular en el campo." />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {CALCULATORS.map((c) => (
          <Link key={c.slug} href={`/calculadoras/${c.slug}`} className="group">
            <Card className="h-full transition-colors group-hover:border-primary">
              <CardHeader>
                <span className="mb-2 flex size-11 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
                  <Calculator className="size-5" aria-hidden />
                </span>
                <CardTitle>{c.shortTitle}</CardTitle>
                <CardDescription>{c.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
