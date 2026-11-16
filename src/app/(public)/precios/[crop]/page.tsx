import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/misc";
import { PriceChart } from "@/components/prices/price-chart";
import { PriceTable } from "@/components/prices/price-table";
import { FxStrip, SourceErrors } from "@/components/prices/fx-strip";
import { getPriceBoard, quotesForCrop } from "@/lib/prices";
import { buildMetadata, breadcrumbLd, faqLd, jsonLd } from "@/lib/seo";
import { formatNumber } from "@/lib/format";
import { CROPS, convertPrice, isCrop, type Crop } from "@/lib/units";
import { BASE_MOISTURE } from "@/lib/calculators/formulas";

export const revalidate = 900;
export const dynamicParams = false;

/** Crops with at least one live source. */
const PRICED_CROPS: Crop[] = ["soja", "maiz", "trigo", "girasol", "sorgo"];

export function generateStaticParams() {
  return PRICED_CROPS.map((crop) => ({ crop }));
}

export async function generateMetadata({ params }: { params: Promise<{ crop: string }> }) {
  const { crop } = await params;
  if (!isCrop(crop)) return {};
  const name = CROPS[crop].name.toLowerCase();
  return buildMetadata({
    title: `Precio ${name} hoy en Rosario, Chicago y Brasil`,
    description: `Precio de ${name} hoy: pizarra Rosario en pesos y dólares por tonelada y quintal, futuros de Chicago y referencia Brasil. Actualizado cada 15 minutos.`,
    path: `/precios/${crop}`,
    keywords: [`precio ${name} hoy`, `precio ${name} rosario`, `${name} pizarra`, `precio ${name} quintal`, `precio ${name} chicago`],
  });
}

export default async function CropPricePage({ params }: { params: Promise<{ crop: string }> }) {
  const { crop } = await params;
  if (!isCrop(crop)) notFound();
  const board = await getPriceBoard();
  const quotes = quotesForCrop(board, crop);
  const name = CROPS[crop].name;
  const rosario = quotes.find((q) => q.market === "rosario");
  const usdArs = board.fx.find((f) => f.pair === "USD/ARS")?.buy;
  const history = board.history[`cme:${crop}`] ?? board.history[`rosario:${crop}`] ?? board.history[`brasil:${crop}`] ?? [];

  const faq = [
    {
      q: `¿Cuánto vale el quintal de ${name.toLowerCase()} hoy?`,
      a: rosario
        ? `Según la pizarra de Rosario del ${rosario.asOf.split("-").reverse().join("/")}, la tonelada de ${name.toLowerCase()} cotiza $${formatNumber(rosario.price, 0)}, es decir $${formatNumber(convertPrice(rosario.price, "t", "qq"), 0)} por quintal${rosario.estimated ? " (precio estimado, sin operaciones)" : ""}.`
        : `Consultá la tabla de esta página: mostramos el precio por tonelada y por quintal con conversión automática.`,
    },
    {
      q: "¿Qué es el precio de pizarra?",
      a: "Es el precio de referencia que publica la Cámara Arbitral de Cereales de la Bolsa de Comercio de Rosario para mercadería disponible, pago contado, puesta sobre camión en zona Rosario.",
    },
    {
      q: `¿Cuál es la humedad base de ${name.toLowerCase()}?`,
      a: `La humedad base de comercialización es ${BASE_MOISTURE[crop]}%. Por encima se aplica merma por secado y manipuleo; podés calcularla con nuestra calculadora de merma.`,
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLd([
          breadcrumbLd([
            { name: "Inicio", path: "/" },
            { name: "Precios", path: "/precios" },
            { name, path: `/precios/${crop}` },
          ]),
          faqLd(faq),
        ])}
      />
      <PageHeader title={`Precio de ${name.toLowerCase()} hoy`} description={`${name} en Rosario, Chicago y Brasil — en pesos, dólares, toneladas y quintales.`} />
      <div className="space-y-6">
        {rosario ? (
          <Card className="border-primary/40 bg-secondary/40">
            <CardContent className="grid gap-4 pt-5 sm:grid-cols-3">
              <Stat label="Pizarra Rosario ($/t)" value={`$ ${formatNumber(rosario.price, 0)}`} />
              <Stat label="Por quintal ($/qq)" value={`$ ${formatNumber(convertPrice(rosario.price, "t", "qq"), 0)}`} />
              <Stat label="En dólares (USD/t)" value={rosario.usdPerTon != null ? `USD ${formatNumber(rosario.usdPerTon, 2)}` : "—"} />
            </CardContent>
          </Card>
        ) : null}
        <FxStrip fx={board.fx} />
        <SourceErrors errors={board.errors} />
        <Card>
          <CardHeader>
            <CardTitle>Cotizaciones de {name.toLowerCase()}</CardTitle>
          </CardHeader>
          <CardContent>
            {quotes.length ? <PriceTable quotes={quotes} fx={board.fx} showCrop={false} /> : <p className="text-muted-foreground">No hay cotizaciones disponibles en este momento.</p>}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Evolución — USD/t</CardTitle>
            <CardDescription>{board.history[`cme:${crop}`] ? "Futuros CBOT 1ª posición" : "Historial guardado por AgroJC"}</CardDescription>
          </CardHeader>
          <CardContent>
            <PriceChart data={history} label={name} />
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Button asChild variant="secondary">
            <Link href="/calculadoras/margen-bruto">Calcular margen bruto</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/calculadoras/merma-por-humedad">Calcular merma por humedad</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/calculadoras/precio-en-chacra">Precio neto en chacra</Link>
          </Button>
        </div>

        <section className="prose-sm max-w-3xl space-y-4">
          <h2 className="text-xl font-bold">Preguntas frecuentes</h2>
          {faq.map((f) => (
            <div key={f.q}>
              <h3 className="font-semibold">{f.q}</h3>
              <p className="text-muted-foreground">{f.a}</p>
            </div>
          ))}
          {usdArs ? <p className="text-xs text-muted-foreground">Tipo de cambio mayorista usado para conversiones: $ {formatNumber(usdArs, 2)}.</p> : null}
        </section>
      </div>
    </>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-3xl font-bold tabular">{value}</p>
    </div>
  );
}
