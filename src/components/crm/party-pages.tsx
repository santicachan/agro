import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { requireOrg } from "@/lib/auth";
import { DOC_TYPES, TAX_CONDITIONS, formatDocNumber, runningBalance } from "@/lib/crm/documents";
import { accountStatement, getParty, listParties, partyBalances, type Kind } from "@/lib/crm/queries";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PartyForm } from "./party-form";

const COPY = {
  customer: { base: "/app/clientes", plural: "Clientes", singular: "cliente", invoice: "factura_venta", payment: "recibo", paymentLabel: "Cobrar" },
  supplier: { base: "/app/proveedores", plural: "Proveedores", singular: "proveedor", invoice: "factura_compra", payment: "orden_pago", paymentLabel: "Pagar" },
} as const;

export async function PartyListPage({ kind, q }: { kind: Kind; q?: string }) {
  const ctx = await requireOrg();
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
  const ctx = await requireOrg();
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

export async function PartyDetailPage({ kind, id, edit }: { kind: Kind; id: string; edit?: boolean }) {
  const ctx = await requireOrg();
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
  const statement = runningBalance((await accountStatement(ctx, id)).map((m) => ({ ...m, amount: m.amount * sign })));
  const balance = statement.at(-1)?.balance ?? 0;
  const cur = ctx.org.base_currency;

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
      <Card className="mb-6">
        <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Saldo {kind === "customer" ? "a cobrar" : "a pagar"}</p>
            <p className={cn("text-3xl font-bold tabular", balance > 0 && "text-destructive")}>{formatMoney(balance, cur)}</p>
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
        <CardHeader>
          <CardTitle>Cuenta corriente</CardTitle>
        </CardHeader>
        <CardContent>
          {statement.length === 0 ? (
            <p className="text-muted-foreground">Sin movimientos.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th>Fecha</Th>
                  <Th>Comprobante</Th>
                  <Th className="text-right">Debe</Th>
                  <Th className="text-right">Haber</Th>
                  <Th className="text-right">Saldo</Th>
                </tr>
              </thead>
              <tbody>
                {statement.map((m) => (
                  <tr key={m.document_id}>
                    <Td className="whitespace-nowrap">{formatDate(`${m.issue_date}T12:00:00`)}</Td>
                    <Td>
                      <Link href={`/app/comprobantes/${m.document_id}`} className="font-medium hover:underline">
                        {DOC_TYPES[m.type].short} {m.letter ?? ""} {formatDocNumber(m.point_of_sale, m.number)}
                      </Link>
                      {m.currency !== cur ? <Badge variant="outline" className="ml-2">{m.currency} {m.total}</Badge> : null}
                    </Td>
                    <Td className="text-right">{m.amount > 0 ? formatMoney(m.amount, cur) : ""}</Td>
                    <Td className="text-right">{m.amount < 0 ? formatMoney(-m.amount, cur) : ""}</Td>
                    <Td className="text-right font-semibold">{formatMoney(m.balance, cur)}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  );
}
