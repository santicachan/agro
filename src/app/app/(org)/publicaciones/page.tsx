import Link from "next/link";
import { Handshake, Plus, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { VerificationForm } from "@/components/marketplace/verification-form";
import { requireOrg } from "@/lib/auth";
import { startBoostCheckout } from "@/lib/billing/actions";
import { FEATURED_LISTING_PRICES } from "@/lib/billing/plans";
import { setListingStatus } from "@/lib/marketplace/actions";
import { isFeatured } from "@/lib/marketplace/queries";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Mis publicaciones" };

export default async function MyListingsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string; publicado?: string }> }) {
  const [sp, ctx] = await Promise.all([searchParams, requireOrg()]);
  const { supabase, org, plan } = ctx;
  const [{ data: listings }, { data: verification }, { data: orders }, { data: inquiries }] = await Promise.all([
    supabase.from("listings").select("id, title, slug, price, currency, status, featured_until, views, created_at").eq("org_id", org.id).neq("status", "removed").order("created_at", { ascending: false }),
    supabase.from("seller_verifications").select("status").eq("org_id", org.id).maybeSingle(),
    supabase.from("marketplace_orders").select("id, amount, currency, commission_amount, commission_pct, status, created_at, listings(title)").eq("seller_org_id", org.id).order("created_at", { ascending: false }).limit(20),
    supabase.from("listing_inquiries").select("id, name, phone, email, message, created_at, listings!inner(title, org_id)").eq("listings.org_id", org.id).order("created_at", { ascending: false }).limit(20),
  ]);
  const active = (listings ?? []).filter((l) => l.status !== "sold").length;

  return (
    <>
      <PageHeader
        title="Mis publicaciones"
        description={`${active} de ${plan.maxListings ?? "∞"} publicaciones · comisión por venta ${plan.commissionPct}%`}
        actions={
          <>
            <Button asChild size="lg" variant="outline">
              <Link href="/app/negocios">
                <Handshake /> Negocios hechos en Marketplace
              </Link>
            </Button>
            <Button asChild size="lg">
              <Link href="/app/publicaciones/nueva">
                <Plus /> Publicar
              </Link>
            </Button>
          </>
        }
      />
      {sp.error ? <Alert tone="error" className="mb-4">{sp.error}</Alert> : null}
      {sp.publicado ? <Alert className="mb-4">¡Tu publicación ya está online!</Alert> : null}
      {sp.ok ? <Alert className="mb-4">Pago recibido: tu publicación se destaca apenas Mercado Pago lo confirme.</Alert> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-3">
          {!listings?.length ? <EmptyState title="Todavía no publicaste nada" /> : null}
          {listings?.map((l) => (
            <Card key={l.id}>
              <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <Link href={`/marketplace/item/${l.slug}`} className="font-semibold hover:underline">
                    {l.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">
                    {l.price != null ? formatMoney(Number(l.price), l.currency, "es-AR", 0) : "Consultar"} · {l.views} visitas
                  </p>
                  <div className="mt-1 flex gap-2">
                    <Badge>{l.status === "active" ? "Activa" : l.status === "paused" ? "Pausada" : l.status === "sold" ? "Vendida" : l.status}</Badge>
                    {isFeatured(l) ? <Badge variant="accent">Destacada hasta {formatDate(l.featured_until!)}</Badge> : null}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {FEATURED_LISTING_PRICES.map((f) => (
                    <form key={f.days} action={startBoostCheckout.bind(null, l.id, f.days)}>
                      <Button size="sm" variant="accent">
                        Destacar {f.days}d · USD {f.priceUsd}
                      </Button>
                    </form>
                  ))}
                  {(l.status === "active" ? ["paused", "sold"] : l.status === "paused" ? ["active"] : []).map((s) => (
                    <form key={s} action={setListingStatus}>
                      <input type="hidden" name="id" value={l.id} />
                      <input type="hidden" name="status" value={s} />
                      <Button size="sm" variant="outline">
                        {s === "paused" ? "Pausar" : s === "sold" ? "Vendida" : "Reactivar"}
                      </Button>
                    </form>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-5 text-success" /> Verificación
              </CardTitle>
            </CardHeader>
            <CardContent>
              {verification?.status === "verified" ? (
                <Badge variant="success">Vendedor verificado</Badge>
              ) : verification?.status === "pending" ? (
                <p className="text-sm text-muted-foreground">Tu solicitud está en revisión.</p>
              ) : (
                <VerificationForm defaultTaxId={org.tax_id} />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Consultas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!inquiries?.length ? <p className="text-muted-foreground">Sin consultas todavía.</p> : null}
              {inquiries?.map((q) => (
                <div key={q.id} className="border-b pb-2">
                  <p className="font-medium">
                    {q.name} · {(q.listings as unknown as { title: string }).title}
                  </p>
                  <p className="text-muted-foreground">{q.message}</p>
                  <p>
                    {q.phone ? (
                      <a className="text-primary" href={`https://wa.me/${q.phone.replace(/\D/g, "")}`}>
                        WhatsApp {q.phone}
                      </a>
                    ) : null}{" "}
                    {q.email ? <a className="text-primary" href={`mailto:${q.email}`}>{q.email}</a> : null}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pedidos</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {!orders?.length ? <p className="text-muted-foreground">Sin pedidos todavía.</p> : null}
              {orders?.map((o) => (
                <div key={o.id} className="flex justify-between border-b pb-2">
                  <span>{(o.listings as unknown as { title: string }).title}</span>
                  <span className="text-right tabular">
                    {formatMoney(Number(o.amount), o.currency, "es-AR", 0)}
                    <span className="block text-xs text-muted-foreground">
                      comisión {o.commission_pct}%: {formatMoney(Number(o.commission_amount), o.currency)}
                    </span>
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
