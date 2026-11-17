import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { DocBadges } from "@/components/crm/doc-badges";
import { requireCrm } from "@/lib/auth";
import { DOC_TYPES, documentLabel, formatDocNumber, type DocType } from "@/lib/crm/documents";
import { balancesFor, listDocuments } from "@/lib/crm/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Comprobantes" };

const QUICK: { type: DocType; label: string; primary?: boolean }[] = [
  { type: "factura_venta", label: "Factura de venta", primary: true },
  { type: "recibo", label: "Cobrar (recibo)" },
  { type: "remito", label: "Remito" },
  { type: "factura_compra", label: "Factura de compra" },
  { type: "orden_pago", label: "Pagar (orden de pago)" },
  { type: "nota_credito_venta", label: "Nota de crédito" },
  { type: "nota_debito_venta", label: "Nota de débito" },
];

const FILTERS: { value?: string; label: string }[] = [
  { label: "Todos" },
  { value: "factura_venta", label: "Facturas de venta" },
  { value: "remito", label: "Remitos" },
  { value: "recibo", label: "Recibos" },
  { value: "factura_compra", label: "Facturas de compra" },
  { value: "orden_pago", label: "Órdenes de pago" },
  { value: "nota_credito_venta", label: "Notas de crédito" },
  { value: "nota_debito_venta", label: "Notas de débito" },
  { value: "nota_credito_compra", label: "NC de proveedores" },
  { value: "nota_debito_compra", label: "ND de proveedores" },
];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const ctx = await requireCrm();
  const docs = await listDocuments(ctx, { type: tipo && tipo in DOC_TYPES ? tipo : undefined, limit: 200 });
  const balances = await balancesFor(ctx, docs.map((d) => d.id));
  return (
    <>
      <PageHeader title="Comprobantes" description="Facturas, remitos, recibos, órdenes de pago y notas, todos vinculados entre sí." />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {QUICK.map((q) => (
          <Button key={q.type} asChild variant={q.primary ? "default" : "secondary"} size="sm" className={cn("h-12 whitespace-normal text-center leading-tight", q.primary && "col-span-2 sm:col-span-1")}>
            <Link href={`/app/comprobantes/nuevo?tipo=${q.type}`}>{q.label}</Link>
          </Button>
        ))}
      </div>
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por tipo">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/app/comprobantes?tipo=${f.value}` : "/app/comprobantes"}
            aria-current={tipo === f.value ? "page" : undefined}
            className={cn("h-10 shrink-0 rounded-full border px-4 text-sm font-medium leading-10", tipo === f.value ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {docs.length === 0 ? (
        <EmptyState title="No hay comprobantes" description="Emití tu primera factura o remito en menos de un minuto." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {docs.map((d) => {
            const pending = balances.get(d.id);
            return (
              <li key={d.id}>
                <Link href={`/app/comprobantes/${d.id}`} className="flex min-h-16 flex-col gap-2 px-4 py-3 hover:bg-muted sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {documentLabel(d.type, d.concept)} {d.letter ?? ""}{" "}
                      <span className="font-normal text-muted-foreground">{formatDocNumber(d.point_of_sale, d.number)}</span>
                    </p>
                    <p className="truncate text-sm text-muted-foreground">
                      {formatDate(`${d.issue_date}T12:00:00`)} · {d.parties?.name}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end">
                    <span className="font-semibold tabular">{formatMoney(Number(d.total), d.currency)}</span>
                    <DocBadges
                      type={d.type}
                      total={Number(d.total)}
                      pending={pending}
                      status={d.status}
                      fiscal={DOC_TYPES[d.type].fiscal}
                      arcaStatus={d.arca_response?.status}
                    />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
