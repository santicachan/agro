import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, FileSpreadsheet, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { requireCrm } from "@/lib/auth";
import { DOC_TYPES, TAX_CONDITIONS, documentLabel, formatDocNumber, runningBalance } from "@/lib/crm/documents";
import { accountStatement, balancesFor, getParty, listParties, partyBalances, type Kind, type StatementRow } from "@/lib/crm/queries";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PartyForm } from "./party-form";
import { DocBadges } from "./doc-badges";

const COPY = {
  customer: { base: "/app/clientes", plural: "Clientes", singular: "cliente", invoice: "factura_venta", payment: "recibo", paymentLabel: "Cobrar" },
  supplier: { base: "/app/proveedores", plural: "Proveedores", singular: "proveedor", invoice: "factura_compra", payment: "orden_pago", paymentLabel: "Pagar" },
} as const;

export async function PartyListPage({ kind, q }: { kind: Kind; q?: string }) {
  const ctx = await requireCrm();
  const c = COPY[kind];
  const [parties, balances] = await Promise.all([listParties(ctx, kind, q), partyBalances(ctx)]);
  const sign = kind === "customer" ? 1 : -1;
  return (
    <>
      <PageHeader
        title={c.plural}
        actions={
          <Button asChild size="lg">
            <Link href={`${c.base}/nuevo`}>
              <Plus /> Nuevo {c.singular}
            </Link>
          </Button>
        }
      />
      <form className="mb-4 flex gap-2" role="search">
        <Input name="q" defaultValue={q} placeholder={`Buscar ${c.singular} por nombre o CUIT`} aria-label="Buscar" />
        <Button type="submit" variant="outline" size="icon" aria-label="Buscar">
          <Search />
        </Button>
      </form>
      {parties.length === 0 ? (
        <EmptyState
          title={q ? "Sin resultados" : `Todavía no cargaste ${c.plural.toLowerCase()}`}
          action={
            <Button asChild>
              <Link href={`${c.base}/nuevo`}>Cargar el primero</Link>
            </Button>
          }
        />
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {parties.map((p) => {
            const bal = (balances.get(p.id) ?? 0) * sign;
            return (
              <li key={p.id}>
                <Link href={`${c.base}/${p.id}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{[p.tax_id, p.city].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-semibold tabular", bal > 0 && "text-destructive")}>{formatMoney(bal, ctx.org.base_currency)}</p>
                    <p className="text-xs text-muted-foreground">{kind === "customer" ? "nos debe" : "le debemos"}</p>
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

export async function PartyNewPage({ kind }: { kind: Kind }) {
  const ctx = await requireCrm();
  return (
    <>
      <PageHeader title={`Nuevo ${COPY[kind].singular}`} />
      <Card>
        <CardContent className="pt-5">
          <PartyForm kind={kind} taxIdLabel={ctx.region.taxIdLabel} />
        </CardContent>
      </Card>
    </>
  );
}

export async function PartyDetailPage({ kind, id, edit, range }: { kind: Kind; id: string; edit?: boolean; range?: { from?: string; to?: string } }) {
  const ctx = await requireCrm();
  const party = await getParty(ctx, id);
  if (!party) notFound();
  const c = COPY[kind];
  if (edit) {
    return (
      <>
        <PageHeader title={`Editar ${party.name}`} />
        <Card>
          <CardContent className="pt-5">
            <PartyForm kind={kind} party={party} taxIdLabel={ctx.region.taxIdLabel} />
          </CardContent>
        </Card>
      </>
    );
  }
  const sign = kind === "customer" ? 1 : -1;
  const { opening: rawOpening, rows } = await accountStatement(ctx, id, range ?? {});
  const opening = rawOpening * sign;
  const statement = runningBalance([{ amount: opening }, ...rows.map((m) => ({ ...m, amount: m.amount * sign }))]).slice(1) as (StatementRow & { balance: number })[];
  const balances = await balancesFor(ctx, rows.map((r) => r.document_id));
  const { rows: allRows } = range?.from || range?.to ? await accountStatement(ctx, id) : { rows };
  const balance = Math.round(allRows.reduce((acc, r) => acc + r.amount * sign, 0) * 100) / 100;
  const cur = ctx.org.base_currency;
  const today = new Date().toISOString().slice(0, 10);
  const overdue = allRows.filter((r) => r.due_date && r.due_date < today && (balances.get(r.document_id) ?? 0) > 0);
  const numbers = new Map(allRows.map((r) => [r.document_id, `${DOC_TYPES[r.type].short} ${r.letter ?? ""} ${formatDocNumber(r.point_of_sale, r.number)}`]));
  const exportQs = new URLSearchParams({ libro: "cuenta-corriente", parte: id, ...(range?.from ? { desde: range.from } : {}), ...(range?.to ? { hasta: range.to } : {}) });

  return (
    <>
      <PageHeader
        title={party.name}
        description={[party.tax_id && `${ctx.region.taxIdLabel} ${party.tax_id}`, party.tax_condition && TAX_CONDITIONS[party.tax_condition], party.phone].filter(Boolean).join(" · ")}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`${c.base}/${id}?editar=1`}>Editar</Link>
          </Button>
        }
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Saldo {kind === "customer" ? "a cobrar" : "a pagar"} hoy</p>
              <p className={cn("text-3xl font-bold tabular", balance > 0 && "text-destructive")}>{formatMoney(balance, cur)}</p>
              {balance < 0 ? <p className="text-sm text-muted-foreground">Saldo a favor {kind === "customer" ? "del cliente" : "nuestro"}</p> : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:flex">
              {kind === "customer" ? (
                <Button asChild variant="secondary">
                  <Link href={`/app/comprobantes/nuevo?tipo=remito&party=${id}`}>Remito</Link>
                </Button>
              ) : null}
              <Button asChild variant="secondary">
                <Link href={`/app/comprobantes/nuevo?tipo=${c.invoice}&party=${id}`}>Factura</Link>
              </Button>
              <Button asChild className="col-span-2 sm:col-span-1">
                <Link href={`/app/comprobantes/nuevo?tipo=${c.payment}&party=${id}`}>{c.paymentLabel}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-sm text-muted-foreground">Comprobantes vencidos</p>
            <p className={cn("text-3xl font-bold tabular", overdue.length && "text-destructive")}>{overdue.length}</p>
            <p className="text-sm text-muted-foreground">{overdue.length ? "con saldo pendiente" : "Todo al día"}</p>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>Cuenta corriente</CardTitle>
            <div className="flex gap-2">
              <Button asChild size="sm" variant="outline">
                <a href={`/app/libros/descargar?${exportQs}&formato=xlsx`}>
                  <FileSpreadsheet /> Excel
                </a>
              </Button>
              <Button asChild size="sm" variant="outline">
                <a href={`/app/libros/descargar?${exportQs}&formato=pdf`}>
                  <FileDown /> PDF
                </a>
              </Button>
            </div>
          </div>
          <form className="grid grid-cols-2 gap-2 sm:flex sm:items-end" aria-label="Filtrar por fecha">
            {edit ? <input type="hidden" name="editar" value="1" /> : null}
            <label className="text-sm">
              Desde
              <Input type="date" name="desde" defaultValue={range?.from} />
            </label>
            <label className="text-sm">
              Hasta
              <Input type="date" name="hasta" defaultValue={range?.to} />
            </label>
            <Button type="submit" variant="secondary" size="sm" className="h-12">
              Filtrar
            </Button>
            {range?.from || range?.to ? (
              <Button asChild variant="ghost" size="sm" className="h-12">
                <Link href={`${c.base}/${id}`}>Ver todo</Link>
              </Button>
            ) : null}
          </form>
        </CardHeader>
        <CardContent>
          {statement.length === 0 && !opening ? (
            <p className="text-muted-foreground">Sin movimientos en el período.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Comprobante</Th>
                  <Th>Referencia</Th>
                  <Th className="text-right">Debe</Th>
                  <Th className="text-right">Haber</Th>
                  <Th className="text-right">Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {range?.from ? (
                  <tr className="bg-muted/50">
                    <Td colSpan={5} className="font-medium">
                      Saldo anterior al {formatDate(`${range.from}T12:00:00`)}
                    </Td>
                    <Td className="text-right font-semibold">{formatMoney(opening, cur)}</Td>
                  </tr>
                ) : null}
                {statement.map((m) => {
                  const informative = m.amount === 0;
                  return (
                    <tr key={m.document_id} className={informative ? "text-muted-foreground" : undefined}>
                      <Td className="whitespace-nowrap">{formatDate(`${m.issue_date}T12:00:00`)}</Td>
                      <Td>
                        <Link href={`/app/comprobantes/${m.document_id}`} className="font-medium hover:underline">
                          {documentLabel(m.type, m.concept)} {m.letter ?? ""} {formatDocNumber(m.point_of_sale, m.number)}
                        </Link>
                        <span className="mt-1 flex flex-wrap gap-1">
                          <DocBadges type={m.type} total={m.total} pending={balances.get(m.document_id)} status={m.status} />
                          {m.currency !== cur ? (
                            <Badge variant="outline">
                              {m.currency} {formatNumber(m.total, 2)} @ {formatNumber(m.fx_rate, 2)}
                            </Badge>
                          ) : null}
                        </span>
                      </Td>
                      <Td className="text-sm">
                        {m.source_document_id && numbers.get(m.source_document_id) ? (
                          <Link href={`/app/comprobantes/${m.source_document_id}`} className="hover:underline">
                            {numbers.get(m.source_document_id)}
                          </Link>
                        ) : informative ? (
                          "Sin importe en cuenta"
                        ) : (
                          ""
                        )}
                      </Td>
                      <Td className="text-right">{m.amount > 0 ? formatMoney(m.amount, cur) : ""}</Td>
                      <Td className="text-right">{m.amount < 0 ? formatMoney(-m.amount, cur) : ""}</Td>
                      <Td className="text-right font-semibold">{informative ? "" : formatMoney(m.balance, cur)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
