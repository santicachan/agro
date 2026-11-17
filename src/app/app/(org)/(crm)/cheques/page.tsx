import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { requireCrm } from "@/lib/auth";
import { updateChequeStatus } from "@/lib/crm/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cheques" };

const STATUS_LABEL: Record<string, string> = {
  en_cartera: "En cartera",
  depositado: "Depositado",
  endosado: "Endosado",
  acreditado: "Acreditado",
  rechazado: "Rechazado",
  emitido: "Emitido",
  debitado: "Debitado",
};

const ACTIONS: Record<string, { status: string; label: string }[]> = {
  en_cartera: [{ status: "depositado", label: "Depositar" }],
  depositado: [
    { status: "acreditado", label: "Acreditado" },
    { status: "rechazado", label: "Rechazado" },
  ],
  emitido: [{ status: "debitado", label: "Debitado" }],
};

export default async function ChequesPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const { ver = "cartera" } = await searchParams;
  const ctx = await requireCrm();
  let q = ctx.supabase
    .from("cheques")
    .select("id, kind, electronic, bank, number, drawer_name, amount, payment_date, status, received:parties!cheques_received_from_fkey(name), delivered:parties!cheques_delivered_to_fkey(name)")
    .eq("org_id", ctx.org.id)
    .order("payment_date");
  if (ver === "cartera") q = q.eq("status", "en_cartera");
  else if (ver === "propios") q = q.eq("kind", "propio");
  const { data } = await q.limit(300);
  const cheques = (data ?? []) as unknown as {
    id: string;
    kind: string;
    electronic: boolean;
    bank: string;
    number: string;
    drawer_name: string | null;
    amount: number;
    payment_date: string;
    status: string;
    received: { name: string } | null;
    delivered: { name: string } | null;
  }[];
  const total = cheques.reduce((s, c) => s + Number(c.amount), 0);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader title="Cheques" description="Cartera de cheques de terceros y cheques propios emitidos." />
      <nav className="mb-4 flex gap-2" aria-label="Vista">
        {[
          ["cartera", "En cartera"],
          ["propios", "Propios"],
          ["todos", "Todos"],
        ].map(([v, label]) => (
          <Link key={v} href={`/app/cheques?ver=${v}`} className={cn("h-10 rounded-full border px-4 leading-10 text-sm font-medium", ver === v ? "bg-primary text-primary-foreground" : "bg-card")}>
            {label}
          </Link>
        ))}
      </nav>
      <Card className="mb-4">
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">Total ({cheques.length} cheques)</p>
          <p className="text-3xl font-bold tabular">{formatMoney(total, ctx.org.base_currency)}</p>
        </CardContent>
      </Card>
      {cheques.length === 0 ? (
        <EmptyState title="No hay cheques" description="Los cheques se cargan al registrar un recibo o una orden de pago." />
      ) : (
        <ul className="space-y-2">
          {cheques.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">
                  {c.bank} #{c.number} {c.electronic ? <Badge variant="outline">eCheq</Badge> : null}
                </p>
                <p className="text-sm text-muted-foreground">
                  Vence {formatDate(`${c.payment_date}T12:00:00`)}
                  {c.payment_date < today && c.status === "en_cartera" ? <Badge variant="destructive" className="ml-2">Vencido</Badge> : null}
                  {c.received ? ` · de ${c.received.name}` : ""}
                  {c.delivered ? ` · a ${c.delivered.name}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <p className="font-semibold tabular">{formatMoney(Number(c.amount), ctx.org.base_currency)}</p>
                  <Badge>{STATUS_LABEL[c.status]}</Badge>
                </div>
                {ACTIONS[c.status]?.map((a) => (
                  <form key={a.status} action={updateChequeStatus}>
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value={a.status} />
                    <Button size="sm" variant={a.status === "rechazado" ? "outline" : "secondary"}>
                      {a.label}
                    </Button>
                  </form>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
