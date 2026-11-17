import Link from "next/link";
import { ArrowRight, Calculator, ChartLine, FileText, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Change } from "@/components/prices/price-table";
import { PriceFreshness } from "@/components/prices/price-freshness";
import { getPriceBoard } from "@/lib/prices";
import { CALCULATORS } from "@/lib/calculators/registry";
import { formatNumber } from "@/lib/format";
import { CROPS, type Crop } from "@/lib/units";
import { site } from "@/lib/site";
import { jsonLd } from "@/lib/seo";

export const revalidate = 900;

const MODULES = [
  { icon: ChartLine, title: "Precios en tiempo real", text: "Pizarra Rosario, Chicago y Brasil en pesos, dólares, quintales y toneladas.", href: "/precios" },
  { icon: Calculator, title: "Calculadoras agro", text: "Margen bruto, siembra, merma, NPK y más. Gratis y desde el celular.", href: "/calculadoras" },
  { icon: FileText, title: "Gestión y facturación", text: "Clientes, cuenta corriente, remitos, facturas, cheques y canjes. Listo para ARCA.", href: "/app" },
  { icon: Store, title: "Marketplace", text: "Comprá y vendé agroquímicos, insumos y maquinaria con vendedores verificados.", href: "/marketplace" },
];

export default async function HomePage() {
  const board = await getPriceBoard();
  const crops: Crop[] = ["soja", "maiz", "trigo", "girasol"];
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: site.name,
          url: site.url,
        })}
      />
      <section className="py-6 sm:py-12">
        <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">Todo tu campo en un solo lugar.</h1>
        <p className="mt-4 max-w-2xl text-lg text-muted-foreground">
          Precios de granos al día, calculadoras gratuitas, gestión comercial simple y un marketplace para comprar y vender insumos y maquinaria.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/ingresar">
              Empezar gratis <ArrowRight />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/precios">Ver precios de hoy</Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="hoy" className="mb-12">
        <h2 id="hoy" className="mb-3 text-xl font-bold">
          Pizarra Rosario hoy
        </h2>
        <PriceFreshness updatedAt={board.updatedAt} refreshMinutes={board.refreshMinutes} className="mb-3" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {crops.map((crop) => {
            const q = board.quotes.find((x) => x.key === `rosario:${crop}`);
            return (
              <Link key={crop} href={`/precios/${crop}`} className="rounded-xl border bg-card p-4 transition-colors hover:border-primary">
                <p className="text-sm font-medium text-muted-foreground">{CROPS[crop].name}</p>
                <p className="text-xl font-bold tabular sm:text-2xl">{q ? `$ ${formatNumber(q.price, 0)}` : "—"}</p>
                <p className="text-sm text-muted-foreground tabular">
                  {q?.usdPerTon != null ? `USD ${formatNumber(q.usdPerTon, 0)}/t ` : null}
                  {q ? <Change pct={q.changePct} direction={q.direction} /> : null}
                </p>
              </Link>
            );
          })}
        </div>
      </section>

      <section className="mb-12 grid gap-4 sm:grid-cols-2">
        {MODULES.map((m) => (
          <Link key={m.href} href={m.href} className="group">
            <Card className="h-full transition-colors group-hover:border-primary">
              <CardHeader>
                <span className="mb-2 flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <m.icon className="size-6" aria-hidden />
                </span>
                <CardTitle className="text-xl">{m.title}</CardTitle>
                <CardDescription className="text-base">{m.text}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>

      <section className="mb-4">
        <h2 className="mb-3 text-xl font-bold">Calculadoras más usadas</h2>
        <Card>
          <CardContent className="flex flex-wrap gap-2 pt-5">
            {CALCULATORS.map((c) => (
              <Button key={c.slug} asChild variant="secondary">
                <Link href={`/calculadoras/${c.slug}`}>{c.shortTitle}</Link>
              </Button>
            ))}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
