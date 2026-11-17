import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { requireOrg } from "@/lib/auth";
import { DOC_TYPES, formatDocNumber, type DocType } from "@/lib/crm/documents";
import { listDocuments } from "@/lib/crm/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Comprobantes" };

const QUICK: { type: DocType; label: string }[] = [
  { type: "factura_venta", label: "Factura" },
  { type: "remito", label: "Remito" },
  { type: "recibo", label: "Cobrar" },
  { type: "factura_compra", label: "Factura de compra" },
  { type: "orden_pago", label: "Pagar" },
];

const FILTERS: { value?: DocType; label: string }[] = [
  { label: "Todos" },
  { value: "factura_venta", label: "Facturas" },
  { value: "remito", label: "Remitos" },
  { value: "recibo", label: "Recibos" },
  { value: "factura_compra", label: "Compras" },
  { value: "orden_pago", label: "Pagos" },
  { value: "nota_debito_venta", label: "Notas de débito" },
];

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const ctx = await requireOrg();
  const docs = await listDocuments(ctx, { type: tipo && tipo in DOC_TYPES ? tipo : undefined });
  return (
    <>
      <PageHeader title="Comprobantes" />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {QUICK.map((q, i) => (
          <Button key={q.type} asChild variant={i === 0 ? "default" : "secondary"} className={cn(i === 0 && "col-span-2 sm:col-span-1")}>
            <Link href={`/app/comprobantes/nuevo?tipo=${q.type}`}>{q.label}</Link>
          </Button>
        ))}
      </div>
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={f.value ? `/app/comprobantes?tipo=${f.value}` : "/app/comprobantes"}
            className={cn("h-10 shrink-0 rounded-full border px-4 leading-10 text-sm font-medium", tipo === f.value ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      {docs.length === 0 ? (
        <EmptyState title="No hay comprobantes" description="Emití tu primera factura o remito en menos de un minuto." />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {docs.map((d) => (
            <li key={d.id}>
              <Link href={`/app/comprobantes/${d.id}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {DOC_TYPES[d.type].label} {d.letter ?? ""} <span className="font-normal text-muted-foreground">{formatDocNumber(d.point_of_sale, d.number)}</span>
                  </p>
                  <p className="truncate text-sm text-muted-foreground">
                    {formatDate(`${d.issue_date}T12:00:00`)} · {d.parties?.name}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="font-semibold tabular">{formatMoney(Number(d.total), d.currency)}</span>
                  {d.status === "authorized" ? <Badge variant="success">CAE</Badge> : null}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
