import Link from "next/link";
import { Button } from "@/components/ui/button";
import { EmptyState, PageHeader } from "@/components/ui/misc";
import { DocBadges } from "@/components/crm/doc-badges";
import { LedgerBadge } from "@/components/crm/ledger-tabs";
import { requireCrm } from "@/lib/auth";
import { DOC_TYPES, documentLabel, formatDocNumber, type DocType } from "@/lib/crm/documents";
import { isLedger } from "@/lib/crm/ledger";
import { balancesFor, listDocuments } from "@/lib/crm/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Comprobantes" };

const QUICK: { type: DocType; label: string; primary?: boolean; gestion?: boolean }[] = [
  { type: "factura_venta", label: "Factura de venta", primary: true },
  { type: "factura_venta", label: "Factura X (Gestión)", gestion: true },
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

const LEDGER_FILTERS = [
  { value: undefined, label: "Todas las cuentas" },
  { value: "blanco", label: "Blanco" },
  { value: "gestion", label: "Gestión (Facturas X)" },
] as const;

export default async function DocumentsPage({ searchParams }: { searchParams: Promise<{ tipo?: string; cuenta?: string }> }) {
  const { tipo, cuenta } = await searchParams;
  const ledger = isLedger(cuenta) ? cuenta : undefined;
  const ctx = await requireCrm();
  const docs = await listDocuments(ctx, { type: tipo && tipo in DOC_TYPES ? tipo : undefined, ledger, limit: 200 });
  const qs = (p: { tipo?: string; cuenta?: string }) => {
    const q = new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString();
    return q ? `/app/comprobantes?${q}` : "/app/comprobantes";
  };
  const balances = await balancesFor(ctx, docs.map((d) => d.id));
  return (
    <>
      <PageHeader title="Comprobantes" description="Facturas, remitos, recibos, órdenes de pago y notas, todos vinculados entre sí." />
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
        {QUICK.map((q) => (
          <Button
            key={`${q.type}-${q.gestion ? "g" : "b"}`}
            asChild
            variant={q.primary ? "default" : q.gestion ? "outline" : "secondary"}
            size="sm"
            className={cn("h-12 whitespace-normal text-center leading-tight", q.primary && "col-span-2 sm:col-span-1")}
          >
            <Link href={`/app/comprobantes/nuevo?tipo=${q.type}${q.gestion ? "&cuenta=gestion" : ""}`}>{q.label}</Link>
          </Button>
        ))}
      </div>
      <nav className="mb-2 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por cuenta">
        {LEDGER_FILTERS.map((f) => (
          <Link
            key={f.label}
            href={qs({ tipo, cuenta: f.value })}
            aria-current={ledger === f.value ? "page" : undefined}
            className={cn("h-10 shrink-0 rounded-full border px-4 text-sm font-semibold leading-10", ledger === f.value ? "bg-foreground text-background" : "bg-card hover:bg-muted")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar por tipo">
        {FILTERS.map((f) => (
          <Link
            key={f.label}
            href={qs({ tipo: f.value, cuenta: ledger })}
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
                      {documentLabel(d.type, d.concept, d.ledger)} {d.letter ?? ""}{" "}
                      <span className="font-normal text-muted-foreground">{formatDocNumber(d.point_of_sale, d.number)}</span> <LedgerBadge ledger={d.ledger} />
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
                      fiscal={DOC_TYPES[d.type].fiscal && d.ledger !== "gestion"}
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
