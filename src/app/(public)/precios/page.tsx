import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { PriceChart } from "@/components/prices/price-chart";
import { PriceTable, Change } from "@/components/prices/price-table";
import { FxStrip, SourceErrors } from "@/components/prices/fx-strip";
import { getPriceBoard } from "@/lib/prices";
import { buildMetadata, breadcrumbLd, jsonLd } from "@/lib/seo";
import { formatNumber } from "@/lib/format";
import { CROPS, type Crop } from "@/lib/units";

export const revalidate = 900; // 15 min ISR

export const metadata = buildMetadata({
  title: "Precios de granos hoy: Rosario, Chicago y Brasil",
  description:
    "Precio de la soja, maíz, trigo y girasol hoy en la pizarra de Rosario, futuros de Chicago (CME) e indicadores de Brasil. En pesos, dólares, quintales y toneladas.",
  path: "/precios",
  keywords: ["precio soja hoy", "pizarra rosario", "precio maíz hoy", "precio trigo hoy", "cotización granos"],
});

const MAIN: Crop[] = ["soja", "maiz", "trigo", "girasol"];

export default async function PreciosPage() {
  const board = await getPriceBoard();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={jsonLd(breadcrumbLd([{ name: "Inicio", path: "/" }, { name: "Precios", path: "/precios" }]))} />
      <PageHeader title="Precios de granos hoy" description="Pizarra de Rosario, futuros de Chicago e indicadores de Brasil, actualizados cada 15 minutos." />
      <div className="space-y-6">
        <FxStrip fx={board.fx} />
        <SourceErrors errors={board.errors} />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MAIN.map((crop) => {
            const q = board.quotes.find((x) => x.key === `rosario:${crop}`) ?? board.quotes.find((x) => x.crop === crop);
            return (
              <Link key={crop} href={`/precios/${crop}`} className="group">
                <Card className="h-full transition-colors group-hover:border-primary">
                  <CardHeader>
                    <CardDescription>{q?.label ?? "Sin datos"}</CardDescription>
                    <CardTitle className="text-xl">{CROPS[crop].name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {q ? (
                      <>
                        <p className="text-2xl font-bold tabular">
                          {q.currency === "ARS" ? "$" : q.currency} {formatNumber(q.price, 0)}
                          <span className="text-sm font-normal text-muted-foreground">/{q.unit}</span>
                        </p>
                        <p className="text-sm text-muted-foreground tabular">
                          {q.usdPerTon != null ? `USD ${formatNumber(q.usdPerTon, 2)}/t` : null} <Change pct={q.changePct} direction={q.direction} />
                        </p>
                      </>
                    ) : (
                      <p className="text-muted-foreground">No disponible</p>
                    )}
                    <p className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Ver detalle <ArrowRight className="size-4" />
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Todos los mercados</CardTitle>
            <CardDescription>Elegí unidad y moneda: la conversión se hace con el tipo de cambio del día.</CardDescription>
          </CardHeader>
          <CardContent>
            <PriceTable quotes={board.quotes} fx={board.fx} />
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {(["soja", "maiz", "trigo"] as Crop[]).map((crop) => (
            <Card key={crop}>
              <CardHeader>
                <CardTitle>{CROPS[crop].name} Chicago — USD/t</CardTitle>
                <CardDescription>Últimos 3 meses, 1ª posición CBOT</CardDescription>
              </CardHeader>
              <CardContent>
                <PriceChart data={board.history[`cme:${crop}`] ?? []} label={`${CROPS[crop].name} Chicago`} />
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Precios informativos de fuentes públicas. La pizarra de Rosario es precio contado, puesto sobre camión en zona Rosario. Actualizado:{" "}
          {new Date(board.fetchedAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}.
        </p>
      </div>
    </>
  );
}
