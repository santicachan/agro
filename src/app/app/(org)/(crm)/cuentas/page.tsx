import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { CurrencyToggle, LedgerTabs } from "@/components/crm/ledger-tabs";
import { requireCrm } from "@/lib/auth";
import { LEDGERS, balancesByLedger, marmolada, parseLedgerView, parseViewCurrency, type Ledger } from "@/lib/crm/ledger";
import { currencyConverter, fxHistory, ledgerMovements, type PartyRow } from "@/lib/crm/queries";
import { fetchFx } from "@/lib/prices/sources/fx";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cuentas corrientes" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ cuenta?: string; moneda?: string }> }) {
  const sp = await searchParams;
  const view = parseLedgerView(sp.cuenta);
  const currency = parseViewCurrency(sp.moneda);
  const ctx = await requireCrm();
  const base = ctx.org.base_currency;
  const [movements, { data: partyData }] = await Promise.all([
    ledgerMovements(ctx),
    ctx.supabase.from("parties").select("id, name, kind, tax_id").eq("org_id", ctx.org.id).order("name"),
  ]);
  const parties = new Map(((partyData ?? []) as Pick<PartyRow, "id" | "name" | "kind" | "tax_id">[]).map((p) => [p.id, p]));

  let value = (m: (typeof movements)[number]): number | null => m.amount;
  if (currency === "USD" && base !== "USD") {
    const [history, fx] = await Promise.all([fxHistory(ctx), fetchFx().catch(() => ({ items: [] }))]);
    const today = fx.items.find((f) => f.pair === (base === "BRL" ? "USD/BRL" : "USD/ARS"))?.sell ?? null;
    value = currencyConverter(base, "USD", history, today);
  }
  let missing = 0;
  const rows = movements.map((m) => {
    const v = value(m);
    if (v == null) missing++;
    return { party_id: m.party_id, ledger: m.ledger, amount: v ?? 0 };
  });
  const cur = currency === "USD" ? "USD" : base;
  const params = { moneda: currency === "USD" ? "USD" : undefined, cuenta: view };

  return (
    <>
      <PageHeader title="Cuentas corrientes" description="Blanco y Gestión por separado, y la Marmolada para conciliar las cuentas en común." />
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <LedgerTabs base="/app/cuentas" current={view} params={{ moneda: params.moneda }} />
        <CurrencyToggle base="/app/cuentas" current={currency} baseCurrency={base} params={params} />
      </div>
      <p className="mb-6 text-sm text-muted-foreground">{LEDGERS[view].description}</p>
      {missing ? (
        <p className="mb-4 rounded-lg border bg-muted/50 p-3 text-sm text-muted-foreground">
          {missing} movimiento(s) en pesos no tienen tipo de cambio de su día y no suman en dólares.
        </p>
      ) : null}
      {view === "marmolada" ? <MarmoladaTable rows={rows} parties={parties} cur={cur} moneda={params.moneda} /> : <LedgerList ledger={view} rows={rows} parties={parties} cur={cur} moneda={params.moneda} />}
    </>
  );
}

type Row = { party_id: string; ledger: Ledger; amount: number };
type Parties = Map<string, Pick<PartyRow, "id" | "name" | "kind" | "tax_id">>;

const partyHref = (p: { id: string; kind: string }, cuenta: string, moneda?: string) =>
  `${p.kind === "supplier" ? "/app/proveedores" : "/app/clientes"}/${p.id}?cuenta=${cuenta}${moneda ? `&moneda=${moneda}` : ""}`;

function LedgerList({ ledger, rows, parties, cur, moneda }: { ledger: Ledger; rows: Row[]; parties: Parties; cur: string; moneda?: string }) {
  const balances = balancesByLedger(rows);
  const items = [...balances.entries()]
    .filter(([, b]) => (ledger === "blanco" ? b.hasBlanco : b.hasGestion))
    .map(([id, b]) => ({ party: parties.get(id), balance: ledger === "blanco" ? b.blanco : b.gestion }))
    .filter((x): x is { party: NonNullable<typeof x.party>; balance: number } => !!x.party);
  const customers = items.filter((x) => x.party.kind !== "supplier");
  const suppliers = items.filter((x) => x.party.kind === "supplier");
  if (!items.length) {
    return (
      <EmptyState
        title={`Sin movimientos en ${LEDGERS[ledger].label}`}
        description={ledger === "gestion" ? "Emití una Factura X o un cobro en Gestión para empezar." : "Emití una factura o un cobro para empezar."}
        action={
          <Link href={`/app/comprobantes/nuevo?tipo=factura_venta${ledger === "gestion" ? "&cuenta=gestion" : ""}`} className="font-medium text-primary hover:underline">
            {ledger === "gestion" ? "Nueva Factura X" : "Nueva factura"}
          </Link>
        }
      />
    );
  }
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Group title="Clientes" label="A cobrar" items={customers} sign={1} cur={cur} ledger={ledger} moneda={moneda} />
      <Group title="Proveedores" label="A pagar" items={suppliers} sign={-1} cur={cur} ledger={ledger} moneda={moneda} />
    </div>
  );
}

function Group({
  title,
  label,
  items,
  sign,
  cur,
  ledger,
  moneda,
}: {
  title: string;
  label: string;
  items: { party: { id: string; name: string; kind: string; tax_id: string | null }; balance: number }[];
  sign: number;
  cur: string;
  ledger: Ledger;
  moneda?: string;
}) {
  const total = items.reduce((s, x) => s + x.balance * sign, 0);
  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle>{title}</CardTitle>
        <p className="text-sm text-muted-foreground">
          {label}: <span className="font-semibold tabular text-foreground">{formatMoney(total, cur)}</span>
        </p>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground">Sin cuentas en esta vista.</p>
        ) : (
          <ul className="divide-y">
            {items.map(({ party, balance }) => {
              const v = balance * sign;
              return (
                <li key={party.id}>
                  <Link href={partyHref(party, ledger, moneda)} className="flex min-h-14 items-center justify-between gap-3 py-2 hover:bg-muted">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{party.name}</span>
                      <span className="text-xs text-muted-foreground">{party.tax_id ?? ""}</span>
                    </span>
                    <span className={cn("font-semibold tabular", v > 0 && "text-destructive")}>{formatMoney(v, cur)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function MarmoladaTable({ rows, parties, cur, moneda }: { rows: Row[]; parties: Parties; cur: string; moneda?: string }) {
  const rec = marmolada(rows)
    .map((r) => ({ ...r, party: parties.get(r.partyId) }))
    .filter((r): r is typeof r & { party: NonNullable<typeof r.party> } => !!r.party)
    .sort((a, b) => a.party.name.localeCompare(b.party.name));
  if (!rec.length) {
    return <EmptyState title="Nada para conciliar" description="Acá aparecen solo los clientes y proveedores que tienen cuenta tanto en Blanco como en Gestión." />;
  }
  const signOf = (kind: string) => (kind === "supplier" ? -1 : 1);
  const totals = rec.reduce(
    (t, r) => {
      const s = signOf(r.party.kind);
      return { blanco: t.blanco + r.blanco * s, gestion: t.gestion + r.gestion * s };
    },
    { blanco: 0, gestion: 0 },
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Conciliación de cuentas en común</CardTitle>
        <p className="text-sm text-muted-foreground">Cada saldo sale de su propia cuenta; los movimientos no se mezclan. Solo lectura.</p>
      </CardHeader>
      <CardContent>
        <Table>
          <thead>
            <tr>
              <Th>Cliente / proveedor</Th>
              <Th className="text-right">Saldo Blanco</Th>
              <Th className="text-right">Saldo Gestión</Th>
              <Th className="text-right">Posición total</Th>
              <Th className="text-right">Diferencia</Th>
            </tr>
          </thead>
          <tbody>
            {rec.map((r) => {
              const s = signOf(r.party.kind);
              return (
                <tr key={r.partyId}>
                  <Td>
                    <Link href={partyHref(r.party, "marmolada", moneda)} className="font-medium hover:underline">
                      {r.party.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">{r.party.kind === "supplier" ? "Proveedor · a pagar" : "Cliente · a cobrar"}</span>
                  </Td>
                  <Td className="text-right">{formatMoney(r.blanco * s, cur)}</Td>
                  <Td className="text-right">{formatMoney(r.gestion * s, cur)}</Td>
                  <Td className="text-right font-semibold">{formatMoney(r.combined * s, cur)}</Td>
                  <Td className="text-right text-muted-foreground">{formatMoney(r.difference * s, cur)}</Td>
                </tr>
              );
            })}
            <tr className="bg-muted/50 font-semibold">
              <Td>Total</Td>
              <Td className="text-right">{formatMoney(totals.blanco, cur)}</Td>
              <Td className="text-right">{formatMoney(totals.gestion, cur)}</Td>
              <Td className="text-right">{formatMoney(totals.blanco + totals.gestion, cur)}</Td>
              <Td className="text-right">{formatMoney(totals.blanco - totals.gestion, cur)}</Td>
            </tr>
          </tbody>
        </Table>
      </CardContent>
    </Card>
  );
}
