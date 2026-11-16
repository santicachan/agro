import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { PlanCards } from "@/components/billing/plan-cards";
import { FEATURED_LISTING_PRICES, PLANS } from "@/lib/billing/plans";
import { buildMetadata, jsonLd } from "@/lib/seo";
import { site } from "@/lib/site";

export const metadata = buildMetadata({
  title: "Planes y precios",
  description: "Empezá gratis. Planes Basic, Pro y Enterprise para gestión comercial agro, facturación electrónica y marketplace.",
  path: "/planes",
});

export default function PlanesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd({
          "@context": "https://schema.org",
          "@type": "Product",
          name: `${site.name} gestión agro`,
          offers: PLANS.map((p) => ({ "@type": "Offer", name: p.name, price: p.priceUsdMonth, priceCurrency: "USD" })),
        })}
      />
      <PageHeader title="Planes simples, sin sorpresas" description="Precios y calculadoras siempre gratis. Pagás solo cuando tu negocio crece." />
      <PlanCards
        action={(p) => (
          <Button asChild className="w-full" variant={p.highlight ? "default" : "outline"}>
            <Link href={p.id === "enterprise" ? "/partners" : "/ingresar"}>{p.id === "free" ? "Empezar gratis" : p.id === "enterprise" ? "Hablemos" : `Elegir ${p.name}`}</Link>
          </Button>
        )}
      />
      <section className="mt-12 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="mb-2 text-xl font-bold">Marketplace</h2>
          <p className="text-muted-foreground">
            Publicar es gratis dentro del límite de tu plan. Cobramos una comisión solo cuando vendés: {PLANS.map((p) => `${p.name} ${p.commissionPct}%`).join(" · ")}.
          </p>
        </div>
        <div>
          <h2 className="mb-2 text-xl font-bold">Publicaciones destacadas</h2>
          <p className="text-muted-foreground">
            Aparecé primero en tu categoría: {FEATURED_LISTING_PRICES.map((f) => `${f.days} días USD ${f.priceUsd}`).join(" · ")}.
          </p>
        </div>
      </section>
    </>
  );
}
