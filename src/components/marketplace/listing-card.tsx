import Link from "next/link";
import { ShieldCheck, Star, Tractor } from "lucide-react";
import { Badge } from "@/components/ui/misc";
import { formatMoney } from "@/lib/format";
import { imageUrl, isFeatured, isVerified, type Listing } from "@/lib/marketplace/queries";
import { cn } from "@/lib/utils";

export function ListingCard({ listing }: { listing: Listing }) {
  const featured = isFeatured(listing);
  return (
    <Link
      href={`/marketplace/item/${listing.slug}`}
      className={cn("group flex flex-col overflow-hidden rounded-xl border bg-card transition-colors hover:border-primary", featured && "border-accent ring-2 ring-accent")}
    >
      <div className="relative aspect-[4/3] bg-muted">
        {listing.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element -- user uploads from Supabase Storage
          <img src={imageUrl(listing.images[0])} alt={listing.title} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Tractor className="size-10" aria-hidden />
          </div>
        )}
        {featured ? (
          <Badge variant="accent" className="absolute left-2 top-2">
            <Star className="size-3" aria-hidden /> Destacado
          </Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="line-clamp-2 font-semibold">{listing.title}</p>
        <p className="text-lg font-bold tabular">
          {listing.price != null ? formatMoney(Number(listing.price), listing.currency, "es-AR", 0) : "Consultar"}
          {listing.unit ? <span className="text-sm font-normal text-muted-foreground"> /{listing.unit}</span> : null}
        </p>
        <p className="mt-auto flex items-center gap-1 text-xs text-muted-foreground">
          {isVerified(listing) ? <ShieldCheck className="size-4 text-success" aria-label="Vendedor verificado" /> : null}
          {[listing.city, listing.province].filter(Boolean).join(", ")}
        </p>
      </div>
    </Link>
  );
}
