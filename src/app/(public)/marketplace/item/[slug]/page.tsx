import Link from "next/link";
import { notFound } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import { InquiryForm } from "@/components/marketplace/inquiry-form";
import { getCategory } from "@/lib/marketplace/categories";
import { getListing, imageUrl, isFeatured, isVerified } from "@/lib/marketplace/queries";
import { placeOrder } from "@/lib/marketplace/actions";
import { formatMoney } from "@/lib/format";
import { absoluteUrl } from "@/lib/site";
import { breadcrumbLd, buildMetadata, jsonLd } from "@/lib/seo";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const l = await getListing((await params).slug);
  if (!l) return {};
  return buildMetadata({ title: l.title, description: l.description.slice(0, 155) || l.title, path: `/marketplace/item/${l.slug}` });
}

export default async function ListingPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ pedido?: string; error?: string }> }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const l = await getListing(slug);
  if (!l) notFound();
  const cat = getCategory(l.category_slug);
  const specs = [
    ["Marca", l.brand],
    ["Modelo", l.model],
    ["Año", l.year],
    ["Estado", l.condition],
    ["Ubicación", [l.city, l.province].filter(Boolean).join(", ")],
  ].filter(([, v]) => v);

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd([
          {
            "@context": "https://schema.org",
            "@type": "Product",
            name: l.title,
            description: l.description,
            image: l.images.map(imageUrl),
            brand: l.brand ? { "@type": "Brand", name: l.brand } : undefined,
            offers:
              l.price != null
                ? {
                    "@type": "Offer",
                    price: Number(l.price),
                    priceCurrency: l.currency,
                    availability: "https://schema.org/InStock",
                    itemCondition: l.condition === "usado" ? "https://schema.org/UsedCondition" : "https://schema.org/NewCondition",
                    url: absoluteUrl(`/marketplace/item/${l.slug}`),
                    seller: { "@type": "Organization", name: l.organizations?.name },
                  }
                : undefined,
          },
          breadcrumbLd([
            { name: "Marketplace", path: "/marketplace" },
            ...(cat ? [{ name: cat.name, path: `/marketplace/${cat.slug}` }] : []),
            { name: l.title, path: `/marketplace/item/${l.slug}` },
          ]),
        ])}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-2">
            {l.images.length ? (
              l.images.map((img, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- user uploads from Supabase Storage
                <img key={img} src={imageUrl(img)} alt={`${l.title} — foto ${i + 1}`} className={`w-full rounded-xl object-cover ${i === 0 ? "sm:col-span-2" : ""}`} />
              ))
            ) : (
              <div className="aspect-video rounded-xl bg-muted sm:col-span-2" />
            )}
          </div>
          <div>
            {cat ? (
              <Link href={`/marketplace/${cat.slug}`} className="text-sm text-primary hover:underline">
                {cat.name}
              </Link>
            ) : null}
            <h1 className="text-2xl font-bold sm:text-3xl">{l.title}</h1>
            <div className="mt-2 flex flex-wrap gap-2">
              {isFeatured(l) ? <Badge variant="accent">Destacado</Badge> : null}
              {isVerified(l) ? (
                <Badge variant="success">
                  <ShieldCheck className="size-3" /> Vendedor verificado
                </Badge>
              ) : null}
            </div>
          </div>
          {specs.length ? (
            <dl className="grid grid-cols-2 gap-3 rounded-xl border bg-card p-4 sm:grid-cols-3">
              {specs.map(([k, v]) => (
                <div key={String(k)}>
                  <dt className="text-xs text-muted-foreground">{k}</dt>
                  <dd className="font-medium capitalize">{v}</dd>
                </div>
              ))}
            </dl>
          ) : null}
          <p className="whitespace-pre-line text-muted-foreground">{l.description}</p>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <p className="text-3xl font-bold tabular">{l.price != null ? formatMoney(Number(l.price), l.currency, "es-AR", 0) : "Consultar precio"}</p>
              {l.unit ? <p className="text-sm text-muted-foreground">por {l.unit}</p> : null}
              <p className="text-sm text-muted-foreground">Vende: {l.organizations?.name}</p>
            </CardHeader>
            {l.price != null ? (
              <CardContent>
                {sp.pedido ? <Alert className="mb-3">Pedido registrado. El vendedor se va a comunicar para coordinar pago y entrega.</Alert> : null}
                {sp.error ? <Alert tone="error" className="mb-3">{sp.error}</Alert> : null}
                <form action={placeOrder.bind(null, l.id)} className="flex gap-2">
                  <Input name="quantity" type="number" min={1} defaultValue={1} className="w-24" aria-label="Cantidad" />
                  <Button type="submit" size="lg" className="flex-1">
                    Comprar
                  </Button>
                </form>
              </CardContent>
            ) : null}
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Consultar</CardTitle>
            </CardHeader>
            <CardContent>
              <InquiryForm listingId={l.id} />
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
