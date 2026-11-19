import Link from "next/link";
import { Handshake, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { requireOrg } from "@/lib/auth";
import { DEAL_STATUS_LABEL, completedDeals } from "@/lib/marketplace/deals";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Negocios hechos en Marketplace" };

export default async function DealsPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver } = await searchParams;
  const ctx = await requireOrg();
  const { rows, totals } = await completedDeals(ctx);
  const filter = ver === "ventas" ? "venta" : ver === "compras" ? "compra" : null;
  const shown = filter ? rows.filter((r) => r.role === filter) : rows;
  const tabs = [
    [undefined, "Todos"],
    ["ventas", "Ventas"],
    ["compras", "Compras"],
  ] as const;

  return (
    <>
      <PageHeader
        title="Negocios hechos en Marketplace"
        description="Ventas y compras cerradas a través del Marketplace."
        actions={
          <Button asChild variant="outline">
            <Link href="/app/publicaciones">
              <Store /> Mis publicaciones
            </Link>
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Negocios cerrados</p>
            <p className="text-3xl font-bold tabular">{rows.length}</p>
          </CardContent>
        </Card>
        {Object.entries(totals).length ? (
          Object.entries(totals).map(([currency, t]) => (
            <Card key={currency} className="sm:col-span-2">
              <CardContent className="grid grid-cols-2 gap-3 pt-5">
                <div>
                  <p className="text-sm text-muted-foreground">Vendido ({currency})</p>
                  <p className="text-2xl font-bold tabular">{formatMoney(t.ventas, currency, "es-AR", 0)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Comprado ({currency})</p>
                  <p className="text-2xl font-bold tabular">{formatMoney(t.compras, currency, "es-AR", 0)}</p>
                </div>
              </CardContent>
            </Card>
          ))
        ) : (
          <Card className="sm:col-span-2">
            <CardContent className="pt-5 text-muted-foreground">Cuando cierres una venta o una compra en el Marketplace la vas a ver acá.</CardContent>
          </Card>
        )}
      </div>
      <nav className="mb-4 flex gap-2" aria-label="Filtrar negocios">
        {tabs.map(([v, label]) => (
          <Link
            key={label}
            href={v ? `/app/negocios?ver=${v}` : "/app/negocios"}
            aria-current={ver === v ? "page" : undefined}
            className={cn("h-10 rounded-full border px-4 text-sm font-medium leading-10", ver === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {label}
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? (
        <EmptyState
          title="Todavía no hay negocios cerrados"
          description="Publicá tus insumos, maquinaria o servicios y los negocios concretados aparecen en esta lista."
          action={
            <Button asChild>
              <Link href="/app/publicaciones/nueva">
                <Handshake /> Publicar en el Marketplace
              </Link>
            </Button>
          }
        />
      ) : (
        <Card>
          <CardContent className="pt-5">
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Publicación</Th>
                  <Th>Tipo</Th>
                  <Th className="text-right">Cantidad</Th>
                  <Th className="text-right">Importe</Th>
                  <Th className="text-right">Comisión</Th>
                  <Th>Estado</Th>
                </tr>
              </thead>
              <tbody>
                {shown.map((d) => (
                  <tr key={d.id}>
                    <Td className="whitespace-nowrap">{formatDate(d.date)}</Td>
                    <Td>
                      {d.slug ? (
                        <Link href={`/marketplace/item/${d.slug}`} className="font-medium hover:underline">
                          {d.title}
                        </Link>
                      ) : (
                        d.title
                      )}
                    </Td>
                    <Td>{d.role === "venta" ? "Venta" : "Compra"}</Td>
                    <Td className="text-right">{d.quantity != null ? formatNumber(d.quantity, 3) : "—"}</Td>
                    <Td className="text-right">{d.amount != null ? formatMoney(d.amount, d.currency) : "—"}</Td>
                    <Td className="text-right">{d.commission != null ? formatMoney(d.commission, d.currency) : "—"}</Td>
                    <Td>
                      <Badge variant={d.status === "completed" || d.status === "sold" ? "success" : "accent"}>{DEAL_STATUS_LABEL[d.status] ?? d.status}</Badge>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
