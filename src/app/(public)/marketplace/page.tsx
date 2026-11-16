import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ListingCard } from "@/components/marketplace/listing-card";
import { CATEGORIES } from "@/lib/marketplace/categories";
import { searchListings } from "@/lib/marketplace/queries";
import { buildMetadata } from "@/lib/seo";

export const revalidate = 300;

export const metadata = buildMetadata({
  title: "Marketplace agro: agroquímicos, insumos y maquinaria",
  description: "Comprá y vendé agroquímicos, semillas, fertilizantes, tractores, cosechadoras y sembradoras. Vendedores verificados.",
  path: "/marketplace",
  keywords: ["venta de agroquímicos", "maquinaria agrícola usada", "tractores usados", "comprar fertilizantes"],
});

export default async function MarketplacePage() {
  const listings = await searchListings({ limit: 24 });
  const roots = CATEGORIES.filter((c) => !c.parent);
  return (
    <>
      <PageHeader
        title="Marketplace"
        description="Agroquímicos, insumos y maquinaria. Contacto directo con el vendedor."
        actions={
          <Button asChild size="lg">
            <Link href="/app/publicaciones/nueva">
              <Plus /> Publicar
            </Link>
          </Button>
        }
      />
      <form action="/marketplace/buscar" className="mb-6 flex gap-2" role="search">
        <Input name="q" placeholder="¿Qué estás buscando? Ej: tractor 120 HP, glifosato" aria-label="Buscar en el marketplace" />
        <Button type="submit" size="icon" aria-label="Buscar">
          <Search />
        </Button>
      </form>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {roots.map((c) => (
          <Link key={c.slug} href={`/marketplace/${c.slug}`} className="rounded-xl border bg-card p-4 font-semibold hover:border-primary">
            {c.name}
            <span className="mt-1 block text-sm font-normal text-muted-foreground">{c.description}</span>
          </Link>
        ))}
      </div>
      <h2 className="mb-3 text-xl font-bold">Últimas publicaciones</h2>
      {listings.length === 0 ? (
        <EmptyState title="Todavía no hay publicaciones" description="Sé el primero en publicar: es gratis dentro de tu plan." />
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {listings.map((l) => (
            <ListingCard key={l.id} listing={l} />
          ))}
        </div>
      )}
    </>
  );
}
