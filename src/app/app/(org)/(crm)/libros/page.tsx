import { BookOpen, Download, FileDown, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { PageHeader } from "@/components/ui/misc";
import { requireCrm } from "@/lib/auth";
import { BOOKS, buildBook, periodLabel, periodRange } from "@/lib/books/books";
import { loadPeriodDocuments } from "@/lib/books/load";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Libros contables" };

const MONTHS = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ anio?: string; mes?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCrm();
  const now = new Date();
  const year = Number(sp.anio) || now.getFullYear();
  const month = sp.mes === "0" ? null : Number(sp.mes) >= 1 && Number(sp.mes) <= 12 ? Number(sp.mes) : now.getMonth() + 1;
  const { from, to } = periodRange(year, month);
  const { docs, related } = await loadPeriodDocuments(ctx, from, to);
  const opts = { orgName: ctx.org.name, currency: ctx.org.base_currency, period: periodLabel(year, month), related };
  const ventas = buildBook("iva-ventas", docs, opts);
  const compras = buildBook("iva-compras", docs, opts);
  const alic = buildBook("alicuotas", docs, opts);
  const counts: Record<string, number> = Object.fromEntries(BOOKS.map((b) => [b.id, b.id === "alicuotas" ? alic.rows.length : buildBook(b.id, docs, opts).rows.length]));
  const qs = `anio=${year}&mes=${month ?? 0}`;
  const cur = ctx.org.base_currency;
  const debito = (["iva_21", "iva_10.5", "iva_27"] as const).reduce((s, k) => s + Number(ventas.totals?.[k] ?? 0), 0);
  const credito = (["iva_21", "iva_10.5", "iva_27"] as const).reduce((s, k) => s + Number(compras.totals?.[k] ?? 0), 0);
  const saldo = Number(alic.totals?.saldo ?? 0);
  const years = Array.from({ length: 4 }, (_, i) => now.getFullYear() - i);

  return (
    <>
      <PageHeader title="Libros contables" description="Todo lo que necesita tu contadora, listo para descargar y enviar." />

      <Card className="mb-6">
        <CardContent className="pt-5">
          <form className="grid grid-cols-2 gap-3 sm:flex sm:items-end" aria-label="Elegir período">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Mes
              <Select name="mes" defaultValue={String(month ?? 0)}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
                <option value="0">Año completo</option>
              </Select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Año
              <Select name="anio" defaultValue={String(year)}>
                {years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </Select>
            </label>
            <Button type="submit" variant="secondary" className="col-span-2 sm:col-span-1">
              Ver período
            </Button>
          </form>
        </CardContent>
      </Card>

      <section aria-label="Resumen del período" className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Ventas del período" value={formatMoney(Number(ventas.totals?.total ?? 0), cur)} hint={`${ventas.rows.length} comprobantes`} />
        <Kpi label="IVA débito fiscal" value={formatMoney(debito, cur)} hint="IVA de tus ventas" />
        <Kpi label="IVA crédito fiscal" value={formatMoney(credito, cur)} hint="IVA de tus compras" />
        <Kpi label={saldo >= 0 ? "Saldo técnico a pagar" : "Saldo técnico a favor"} value={formatMoney(Math.abs(saldo), cur)} hint="Débito − crédito" emphasis />
      </section>

      <Card className="mb-6 border-primary/40 bg-secondary/40">
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Download className="size-5" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">Paquete completo para la contadora — {periodLabel(year, month)}</p>
              <p className="text-sm text-muted-foreground">Los 6 libros en un solo archivo: Excel con una hoja por libro o PDF listo para imprimir.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button asChild>
              <a href={`/app/libros/descargar?libro=todos&formato=xlsx&${qs}`}>
                <FileSpreadsheet /> Excel
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href={`/app/libros/descargar?libro=todos&formato=pdf&${qs}`}>
                <FileDown /> PDF
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {BOOKS.map((b) => (
          <Card key={b.id} className="flex flex-col">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <BookOpen className="size-5 text-primary" aria-hidden /> {b.title}
              </CardTitle>
              <CardDescription>{b.description}</CardDescription>
            </CardHeader>
            <CardContent className="mt-auto flex flex-wrap items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">{b.id === "alicuotas" ? "Resumen" : `${counts[b.id]} ${counts[b.id] === 1 ? "registro" : "registros"}`}</span>
              <div className="flex gap-2">
                <Button asChild size="sm" variant="secondary">
                  <a href={`/app/libros/descargar?libro=${b.id}&formato=xlsx&${qs}`} aria-label={`Descargar ${b.title} en Excel`}>
                    <FileSpreadsheet /> Excel
                  </a>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <a href={`/app/libros/descargar?libro=${b.id}&formato=pdf&${qs}`} aria-label={`Descargar ${b.title} en PDF`}>
                    <FileDown /> PDF
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <p className="mt-6 text-xs text-muted-foreground">
        Importes en {cur}; los comprobantes en dólares se convierten al tipo de cambio de cada comprobante y las notas de crédito restan. Las retenciones, percepciones y saldos de períodos
        anteriores no están incluidos: confirmalos con tu contadora.
      </p>
    </>
  );
}

function Kpi({ label, value, hint, emphasis }: { label: string; value: string; hint: string; emphasis?: boolean }) {
  return (
    <div className={cn("rounded-xl border bg-card p-4", emphasis && "border-primary")}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-xl font-bold tabular sm:text-2xl">{value}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
