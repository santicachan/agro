import Link from "next/link";
import { FileText, Handshake, Receipt, Truck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { requireCrm } from "@/lib/auth";
import { usagePct } from "@/lib/billing/plans";
import { chequesInPortfolio, partyLedgerBalances, usage } from "@/lib/crm/queries";
import { completedDeals } from "@/lib/marketplace/deals";
import { formatMoney } from "@/lib/format";

export const metadata = { title: "Inicio" };

const QUICK = [
  { href: "/app/comprobantes/nuevo?tipo=factura_venta", label: "Facturar", icon: FileText },
  { href: "/app/comprobantes/nuevo?tipo=recibo", label: "Cobrar", icon: Receipt },
  { href: "/app/clientes/nuevo", label: "Nuevo cliente", icon: Users },
  { href: "/app/comprobantes/nuevo?tipo=orden_pago", label: "Pagar", icon: Truck },
];

export default async function DashboardPage() {
  const ctx = await requireCrm();
  const [balances, cheques, use, deals] = await Promise.all([partyLedgerBalances(ctx), chequesInPortfolio(ctx), usage(ctx), completedDeals(ctx)]);
  const totals = { blanco: { receivable: 0, payable: 0 }, gestion: { receivable: 0, payable: 0 } };
  for (const b of balances.values()) {
    for (const l of ["blanco", "gestion"] as const) {
      const v = b[l];
      if (v > 0) totals[l].receivable += v;
      else totals[l].payable += -v;
    }
  }
  const cur = ctx.org.base_currency;
  const chequesTotal = cheques.filter((c) => (c.currency ?? cur) === cur).reduce((s, c) => s + Number(c.amount), 0);

  return (
    <>
      <PageHeader
        title={`Hola, ${ctx.org.name}`}
        actions={
          <Button asChild size="lg" variant="outline">
            <Link href="/app/negocios">
              <Handshake /> Negocios hechos en Marketplace
            </Link>
          </Button>
        }
      />
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
        <Kpi
          label="A cobrar · Blanco"
          value={formatMoney(totals.blanco.receivable, cur)}
          detail={totals.gestion.receivable ? `Gestión: ${formatMoney(totals.gestion.receivable, cur)}` : undefined}
          href="/app/cuentas?cuenta=blanco"
        />
        <Kpi
          label="A pagar · Blanco"
          value={formatMoney(totals.blanco.payable, cur)}
          detail={totals.gestion.payable ? `Gestión: ${formatMoney(totals.gestion.payable, cur)}` : undefined}
          href="/app/cuentas?cuenta=blanco"
        />
        <Kpi label={`Cheques en cartera (${cheques.length})`} value={formatMoney(chequesTotal, cur)} href="/app/cheques" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Negocios hechos en Marketplace</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {deals.rows.length ? (
              <ul className="divide-y">
                {deals.rows.slice(0, 4).map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-medium">{d.title}</span>
                      <span className="block text-xs text-muted-foreground">{d.role === "venta" ? "Venta" : "Compra"}</span>
                    </span>
                    <span className="tabular">{d.amount != null ? formatMoney(d.amount, d.currency) : "—"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">Todavía no cerraste negocios en el Marketplace.</p>
            )}
            <Button asChild size="lg" className="w-full sm:w-auto">
              <Link href="/app/negocios">
                <Handshake /> Ver negocios hechos en Marketplace
              </Link>
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

function Kpi({ label, value, href, detail }: { label: string; value: string; href: string; detail?: string }) {
  return (
    <Link href={href} className="rounded-xl border bg-card p-4 hover:border-primary">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold tabular">{value}</p>
      {detail ? <p className="text-xs tabular text-muted-foreground">{detail}</p> : null}
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
