import type { Metadata } from "next";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ListingCard } from "@/components/marketplace/listing-card";
import { searchListings } from "@/lib/marketplace/queries";

export const metadata: Metadata = { title: "Buscar en el marketplace", robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const listings = q ? await searchListings({ q }) : [];
  return (
    <>
      <PageHeader title={q ? `Resultados para “${q}”` : "Buscar"} />
      {listings.length === 0 ? (
        <EmptyState title="Sin resultados" description="Probá con otras palabras." />
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
