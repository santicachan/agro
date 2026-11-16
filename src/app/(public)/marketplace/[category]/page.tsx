import Link from "next/link";
import { notFound } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { ListingCard } from "@/components/marketplace/listing-card";
import { CATEGORIES, childrenOf, getCategory } from "@/lib/marketplace/categories";
import { searchListings } from "@/lib/marketplace/queries";
import { buildMetadata, breadcrumbLd, jsonLd } from "@/lib/seo";
import { cn } from "@/lib/utils";

export const revalidate = 300;
export const dynamicParams = false;

export function generateStaticParams() {
  return CATEGORIES.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }) {
  const cat = getCategory((await params).category);
  if (!cat) return {};
  return buildMetadata({ title: `${cat.name} en venta`, description: cat.description, path: `/marketplace/${cat.slug}`, keywords: [`${cat.name.toLowerCase()} en venta`, `comprar ${cat.name.toLowerCase()}`] });
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const cat = getCategory((await params).category);
  if (!cat) notFound();
  const parent = cat.parent ? getCategory(cat.parent) : null;
  const subs = childrenOf(parent?.slug ?? cat.slug);
  const listings = await searchListings({ category: cat.slug });
  const crumbs = [
    { name: "Marketplace", path: "/marketplace" },
    ...(parent ? [{ name: parent.name, path: `/marketplace/${parent.slug}` }] : []),
    { name: cat.name, path: `/marketplace/${cat.slug}` },
  ];
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbLd(crumbs))} />
      <PageHeader title={`${cat.name} en venta`} description={cat.description} />
      {subs.length ? (
        <nav className="mb-6 flex gap-2 overflow-x-auto pb-1" aria-label="Subcategorías">
          {(parent ? [parent, ...subs] : [cat, ...subs]).map((s) => (
            <Link key={s.slug} href={`/marketplace/${s.slug}`} className={cn("h-10 shrink-0 rounded-full border px-4 leading-10 text-sm font-medium", s.slug === cat.slug ? "bg-primary text-primary-foreground" : "bg-card")}>
              {s.parent ? s.name : "Todo"}
            </Link>
          ))}
        </nav>
      ) : null}
      {listings.length === 0 ? (
        <EmptyState title="No hay publicaciones en esta categoría" description="Volvé pronto o publicá la tuya." />
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
