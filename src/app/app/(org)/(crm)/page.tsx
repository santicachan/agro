import Link from "next/link";
import { FileText, Receipt, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { Change } from "@/components/prices/price-table";
import { requireCrm } from "@/lib/auth";
import { usagePct } from "@/lib/billing/plans";
import { chequesInPortfolio, partyBalances, usage } from "@/lib/crm/queries";
import { getPriceBoard } from "@/lib/prices";
import { formatMoney, formatNumber } from "@/lib/format";
import { CROPS, type Crop } from "@/lib/units";

export const metadata = { title: "Inicio" };

const QUICK = [
  { href: "/app/comprobantes/nuevo?tipo=factura_venta", label: "Facturar", icon: FileText },
  { href: "/app/comprobantes/nuevo?tipo=recibo", label: "Cobrar", icon: Receipt },
  { href: "/app/clientes/nuevo", label: "Nuevo cliente", icon: Users },
  { href: "/app/comprobantes/nuevo?tipo=orden_pago", label: "Pagar", icon: Truck },
];

export default async function DashboardPage() {
  const ctx = await requireCrm();
  const [balances, cheques, use, board] = await Promise.all([partyBalances(ctx), chequesInPortfolio(ctx), usage(ctx), getPriceBoard()]);
  let receivable = 0;
  let payable = 0;
  for (const v of balances.values()) {
    if (v > 0) receivable += v;
    else payable += -v;
  }
  const chequesTotal = cheques.reduce((s, c) => s + Number(c.amount), 0);
  const cur = ctx.org.base_currency;
  const crops: Crop[] = ["soja", "maiz", "trigo", "girasol"];

  return (
    <>
      <PageHeader title={`Hola, ${ctx.org.name}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {QUICK.map((q) => (
          <Button key={q.href} asChild size="lg" variant="secondary" className="h-20 flex-col gap-1">
            <Link href={q.href}>
              <q.icon className="size-6" />
              {q.label}
            </Link>
          </Button>
        ))}
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Kpi label="A cobrar" value={formatMoney(receivable, cur)} href="/app/clientes" />
        <Kpi label="A pagar" value={formatMoney(payable, cur)} href="/app/proveedores" />
        <Kpi label={`Cheques en cartera (${cheques.length})`} value={formatMoney(chequesTotal, cur)} href="/app/cheques" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Pizarra Rosario</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {crops.map((c) => {
                const q = board.quotes.find((x) => x.key === `rosario:${c}`);
                return (
                  <li key={c} className="flex items-center justify-between py-3">
                    <span className="font-medium">{CROPS[c].name}</span>
                    <span className="tabular">
                      {q ? `$ ${formatNumber(q.price, 0)} · USD ${formatNumber(q.usdPerTon ?? 0, 0)}` : "—"} {q ? <Change pct={q.changePct} direction={q.direction} /> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
            <Button asChild variant="link" className="px-0">
              <Link href="/precios">Ver todos los mercados</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Uso del plan {ctx.plan.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Usage label="Clientes y proveedores" used={use.parties} limit={ctx.plan.maxCustomers} />
            <Usage label="Comprobantes este mes" used={use.invoices} limit={ctx.plan.maxInvoicesMonth} />
            <Button asChild variant="outline">
              <Link href="/app/plan">Mejorar plan</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Kpi({ label, value, href }: { label: string; value: string; href: string }) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-4 hover:border-primary">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular">{value}</p>
    </Link>
  );
}

function Usage({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const pct = usagePct(used, limit);
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular text-muted-foreground">
          {used} / {limit ?? "∞"}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={used} aria-valuemax={limit ?? undefined} aria-label={label}>
        <div className={pct != null && pct >= 90 ? "h-full bg-destructive" : "h-full bg-primary"} style={{ width: `${pct ?? 5}%` }} />
      </div>
    </div>
  );
}
