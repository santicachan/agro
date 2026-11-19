import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, FileSpreadsheet, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Badge, EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { requireCrm } from "@/lib/auth";
import { DOC_TYPES, TAX_CONDITIONS, documentLabel, formatDocNumber, runningBalance } from "@/lib/crm/documents";
import { LEDGERS, type Ledger, type LedgerView, type ViewCurrency } from "@/lib/crm/ledger";
import { accountStatement, balancesFor, currencyConverter, fxHistory, getParty, listParties, partyLedgerBalances, type Kind, type StatementRow } from "@/lib/crm/queries";
import { fetchFx } from "@/lib/prices/sources/fx";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PartyForm } from "./party-form";
import { DocBadges } from "./doc-badges";
import { CurrencyToggle, LedgerTabs } from "./ledger-tabs";

const COPY = {
  customer: { base: "/app/clientes", plural: "Clientes", singular: "cliente", invoice: "factura_venta", payment: "recibo", paymentLabel: "Cobrar" },
  supplier: { base: "/app/proveedores", plural: "Proveedores", singular: "proveedor", invoice: "factura_compra", payment: "orden_pago", paymentLabel: "Pagar" },
} as const;

export async function PartyListPage({ kind, q }: { kind: Kind; q?: string }) {
  const ctx = await requireCrm();
  const c = COPY[kind];
  const [parties, balances] = await Promise.all([listParties(ctx, kind, q), partyLedgerBalances(ctx)]);
  const sign = kind === "customer" ? 1 : -1;
  const cur = ctx.org.base_currency;
  return (
    <>
      <PageHeader
        title={c.plural}
        actions={
          <>
            <Button asChild size="lg" variant="outline">
              <Link href="/app/cuentas">Cuentas corrientes</Link>
            </Button>
            <Button asChild size="lg">
              <Link href={`${c.base}/nuevo`}>
                <Plus /> Nuevo {c.singular}
              </Link>
            </Button>
          </>
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
            const b = balances.get(p.id);
            const blanco = (b?.blanco ?? 0) * sign;
            const gestion = (b?.gestion ?? 0) * sign;
            return (
              <li key={p.id}>
                <Link href={`${c.base}/${p.id}`} className="flex min-h-16 items-center justify-between gap-3 px-4 py-3 hover:bg-muted">
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{p.name}</p>
                    <p className="text-sm text-muted-foreground">{[p.tax_id, p.city].filter(Boolean).join(" · ") || "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className={cn("font-semibold tabular", blanco > 0 && "text-destructive")}>{formatMoney(blanco, cur)}</p>
                    {b?.hasGestion ? (
                      <p className="text-xs tabular text-muted-foreground">
                        Gestión {formatMoney(gestion, cur)}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">{kind === "customer" ? "nos debe" : "le debemos"}</p>
                    )}
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

type StatementLine = StatementRow & { view: number; balance: number };

export async function PartyDetailPage({
  kind,
  id,
  edit,
  range,
  view = "blanco",
  currency = "ARS",
}: {
  kind: Kind;
  id: string;
  edit?: boolean;
  range?: { from?: string; to?: string };
  view?: LedgerView;
  currency?: ViewCurrency;
}) {
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
  const base = ctx.org.base_currency;
  const cur = currency === "USD" ? "USD" : base;
  const { rows: all } = await accountStatement(ctx, id);
  const hasBlanco = all.some((r) => r.ledger === "blanco");
  const hasGestion = all.some((r) => r.ledger === "gestion");
  const both = hasBlanco && hasGestion;
  const current: LedgerView = view;

  // Pesos ⇄ dólares: each movement converted with the rate of its own day.
  let convert = (m: StatementRow): number | null => m.amount;
  if (currency === "USD" && base !== "USD") {
    const [history, fx] = await Promise.all([fxHistory(ctx), fetchFx().catch(() => ({ items: [] }))]);
    const today = fx.items.find((f) => f.pair === (base === "BRL" ? "USD/BRL" : "USD/ARS"))?.sell ?? null;
    const conv = currencyConverter(base, "USD", history, today);
    convert = (m) => conv(m);
  }
  let missingRate = false;
  const valued = (m: StatementRow) => {
    const v = convert(m);
    if (v == null) {
      missingRate = true;
      return 0;
    }
    return v * sign;
  };
  const statementFor = (ledger: Ledger) => {
    const rows = all.filter((r) => r.ledger === ledger);
    const before = range?.from ? rows.filter((r) => r.issue_date < range.from!) : [];
    const inRange = rows.filter((r) => (!range?.from || r.issue_date >= range.from) && (!range?.to || r.issue_date <= range.to));
    const opening = Math.round(before.reduce((s, r) => s + valued(r), 0) * 100) / 100;
    const lines = runningBalance([{ amount: opening }, ...inRange.map((m) => ({ ...m, amount: valued(m) }))]).slice(1) as (StatementRow & { balance: number })[];
    const balance = Math.round(rows.filter((r) => !range?.to || r.issue_date <= range.to).reduce((s, r) => s + valued(r), 0) * 100) / 100;
    return { opening, lines: lines.map((l) => ({ ...l, view: l.amount })) as StatementLine[], balance, total: Math.round(rows.reduce((s, r) => s + valued(r), 0) * 100) / 100 };
  };

  const balances = await balancesFor(ctx, all.map((r) => r.document_id));
  const today = new Date().toISOString().slice(0, 10);
  const ledgerRows = current === "marmolada" ? all : all.filter((r) => r.ledger === current);
  const overdue = ledgerRows.filter((r) => r.due_date && r.due_date < today && (balances.get(r.document_id) ?? 0) > 0);
  const numbers = new Map(all.map((r) => [r.document_id, `${DOC_TYPES[r.type].short} ${r.letter ?? ""} ${formatDocNumber(r.point_of_sale, r.number)}`]));
  const params = { cuenta: current, moneda: currency === "USD" ? "USD" : undefined, desde: range?.from, hasta: range?.to };
  const action = (type: string, ledger: Ledger) => `/app/comprobantes/nuevo?tipo=${type}&party=${id}${ledger === "gestion" ? "&cuenta=gestion" : ""}`;
  const views: LedgerView[] = both ? ["blanco", "gestion", "marmolada"] : ["blanco", "gestion"];
  const statements = { blanco: statementFor("blanco"), gestion: statementFor("gestion") };
  const actionLedger: Ledger = current === "gestion" ? "gestion" : "blanco";
  const headline = current === "marmolada" ? null : statements[current];

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
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <LedgerTabs base={`${c.base}/${id}`} current={current} views={views} params={{ ...params, cuenta: undefined }} />
        <CurrencyToggle base={`${c.base}/${id}`} current={currency} baseCurrency={base} params={params} />
      </div>
      <p className="mb-4 text-sm text-muted-foreground">{LEDGERS[current].description}</p>
      {missingRate ? (
        <p className="mb-4 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          Algunos movimientos en pesos no tienen tipo de cambio de su día y se muestran en 0 en dólares.
        </p>
      ) : null}

      {current === "marmolada" ? (
        both ? (
          <Reconciliation statements={statements} cur={cur} kind={kind} />
        ) : (
          <Card className="mb-6">
            <CardContent className="pt-5 text-muted-foreground">
              La Marmolada aparece cuando el {c.singular} tiene movimientos tanto en Blanco como en Gestión.
            </CardContent>
          </Card>
        )
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          <Card className="sm:col-span-2">
            <CardContent className="flex flex-col gap-4 pt-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Saldo {kind === "customer" ? "a cobrar" : "a pagar"} · {LEDGERS[current].label}
                </p>
                <p className={cn("text-3xl font-bold tabular", (headline?.total ?? 0) > 0 && "text-destructive")}>{formatMoney(headline?.total ?? 0, cur)}</p>
                {(headline?.total ?? 0) < 0 ? <p className="text-sm text-muted-foreground">Saldo a favor {kind === "customer" ? "del cliente" : "nuestro"}</p> : null}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                {kind === "customer" ? (
                  <Button asChild variant="secondary">
                    <Link href={action("remito", actionLedger)}>Remito</Link>
                  </Button>
                ) : null}
                <Button asChild variant="secondary">
                  <Link href={action(c.invoice, actionLedger)}>{actionLedger === "gestion" ? "Factura X" : "Factura"}</Link>
                </Button>
                <Button asChild className="col-span-2 sm:col-span-1">
                  <Link href={action(c.payment, actionLedger)}>{c.paymentLabel}</Link>
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
      )}

      <form className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:items-end" aria-label="Filtrar por fecha">
        <input type="hidden" name="cuenta" value={current} />
        {currency === "USD" ? <input type="hidden" name="moneda" value="USD" /> : null}
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
            <Link href={`${c.base}/${id}?cuenta=${current}${currency === "USD" ? "&moneda=USD" : ""}`}>Ver todo</Link>
          </Button>
        ) : null}
      </form>

      {current === "marmolada" ? (
        both ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {(["blanco", "gestion"] as const).map((l) => (
              <StatementCard key={l} title={`Cuenta ${LEDGERS[l].label}`} statement={statements[l]} cur={cur} range={range} balances={balances} numbers={numbers} compact />
            ))}
          </div>
        ) : null
      ) : (
        <StatementCard
          title={`Cuenta corriente · ${LEDGERS[current].label}`}
          statement={statements[current]}
          cur={cur}
          range={range}
          balances={balances}
          numbers={numbers}
          exportQs={new URLSearchParams({
            libro: "cuenta-corriente",
            parte: id,
            cuenta: current,
            ...(currency === "USD" ? { moneda: "USD" } : {}),
            ...(range?.from ? { desde: range.from } : {}),
            ...(range?.to ? { hasta: range.to } : {}),
          }).toString()}
        />
      )}
    </>
  );
}

function Reconciliation({ statements, cur, kind }: { statements: Record<Ledger, { total: number }>; cur: string; kind: Kind }) {
  const b = statements.blanco.total;
  const g = statements.gestion.total;
  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Conciliación Marmolada</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-4">
        <Stat label="Saldo Blanco" value={formatMoney(b, cur)} />
        <Stat label="Saldo Gestión" value={formatMoney(g, cur)} />
        <Stat label={`Posición total ${kind === "customer" ? "a cobrar" : "a pagar"}`} value={formatMoney(b + g, cur)} strong />
        <Stat label="Diferencia Blanco − Gestión" value={formatMoney(b - g, cur)} />
        <p className="text-xs text-muted-foreground sm:col-span-4">
          Los movimientos de cada cuenta se muestran por separado y no se mezclan. La Marmolada es solo para ver y conciliar: no se cargan comprobantes desde acá.
        </p>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-lg border p-3", strong && "border-primary bg-primary/5")}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular font-semibold", strong ? "text-2xl" : "text-xl")}>{value}</p>
    </div>
  );
}

function StatementCard({
  title,
  statement,
  cur,
  range,
  balances,
  numbers,
  exportQs,
  compact,
}: {
  title: string;
  statement: { opening: number; lines: StatementLine[] };
  cur: string;
  range?: { from?: string; to?: string };
  balances: Map<string, number>;
  numbers: Map<string, string>;
  exportQs?: string;
  compact?: boolean;
}) {
  const { opening, lines } = statement;
  return (
    <Card>
      <CardHeader className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle>{title}</CardTitle>
          {exportQs ? (
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
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {lines.length === 0 && !opening ? (
          <p className="text-muted-foreground">Sin movimientos en el período.</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Fecha</Th>
                <Th>Comprobante</Th>
                {compact ? null : <Th>Referencia</Th>}
                <Th className="text-right">Debe</Th>
                <Th className="text-right">Haber</Th>
                <Th className="text-right">Saldo</Th>
              </tr>
            </thead>
            <tbody>
              {range?.from ? (
                <tr className="bg-muted/50">
                  <Td colSpan={compact ? 4 : 5} className="font-medium">
                    Saldo anterior al {formatDate(`${range.from}T12:00:00`)}
                  </Td>
                  <Td className="text-right font-semibold">{formatMoney(opening, cur)}</Td>
                </tr>
              ) : null}
              {lines.map((m) => {
                const informative = m.amount === 0 && m.total === 0;
                return (
                  <tr key={m.document_id} className={informative ? "text-muted-foreground" : undefined}>
                    <Td className="whitespace-nowrap">{formatDate(`${m.issue_date}T12:00:00`)}</Td>
                    <Td>
                      <Link href={`/app/comprobantes/${m.document_id}`} className="font-medium hover:underline">
                        {documentLabel(m.type, m.concept, m.ledger)} {m.letter ?? ""} {formatDocNumber(m.point_of_sale, m.number)}
                      </Link>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <DocBadges type={m.type} total={m.total} pending={balances.get(m.document_id)} status={m.status} />
                        {m.currency !== cur ? (
                          <Badge variant="outline">
                            {m.currency} {formatNumber(m.total, 2)}
                            {m.fx_rate !== 1 ? ` @ ${formatNumber(m.fx_rate, 2)}` : ""}
                          </Badge>
                        ) : null}
                      </span>
                    </Td>
                    {compact ? null : (
                      <Td className="text-sm">
                        {m.source_document_id && numbers.get(m.source_document_id) ? (
                          <Link href={`/app/comprobantes/${m.source_document_id}`} className="hover:underline">
                            {numbers.get(m.source_document_id)}
                          </Link>
                        ) : m.type === "remito" ? (
                          "Sin importe en cuenta"
                        ) : (
                          ""
                        )}
                      </Td>
                    )}
                    <Td className="text-right">{m.amount > 0 ? formatMoney(m.amount, cur) : ""}</Td>
                    <Td className="text-right">{m.amount < 0 ? formatMoney(-m.amount, cur) : ""}</Td>
                    <Td className="text-right font-semibold">{m.type === "remito" ? "" : formatMoney(m.balance, cur)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
