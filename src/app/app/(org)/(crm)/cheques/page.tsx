import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/form";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { requireCrm } from "@/lib/auth";
import { rejectCheque, updateChequeStatus } from "@/lib/crm/actions";
import { formatDate, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cheques" };

const STATUS: Record<string, { label: string; variant: "secondary" | "accent" | "success" | "destructive" | "outline" }> = {
  en_cartera: { label: "Pendiente (en cartera)", variant: "accent" },
  depositado: { label: "Depositado", variant: "secondary" },
  acreditado: { label: "Cobrado", variant: "success" },
  rechazado: { label: "Rechazado", variant: "destructive" },
  endosado: { label: "Entregado a proveedor", variant: "outline" },
  emitido: { label: "Emitido (propio)", variant: "accent" },
  debitado: { label: "Debitado", variant: "success" },
};

const ACTIONS: Record<string, { status: string; label: string }[]> = {
  en_cartera: [{ status: "depositado", label: "Depositar" }],
  depositado: [{ status: "acreditado", label: "Marcar cobrado" }],
  emitido: [{ status: "debitado", label: "Marcar debitado" }],
};
const REJECTABLE = ["en_cartera", "depositado", "endosado", "emitido"];

const VIEWS = [
  ["cartera", "Pendientes"],
  ["depositados", "Depositados"],
  ["rechazados", "Rechazados"],
  ["propios", "Propios"],
  ["todos", "Todos"],
] as const;

export default async function ChequesPage({ searchParams }: { searchParams: Promise<{ ver?: string; error?: string }> }) {
  const { ver = "cartera", error } = await searchParams;
  const ctx = await requireCrm();
  let q = ctx.supabase
    .from("cheques")
    .select(
      "id, kind, electronic, bank, number, drawer_name, amount, payment_date, status, deposited_at, credited_at, rejected_at, rejection_reason, rejection_document_id, supplier_debit_document_id, received:parties!cheques_received_from_fkey(name), delivered:parties!cheques_delivered_to_fkey(name)",
    )
    .eq("org_id", ctx.org.id)
    .order("payment_date");
  if (ver === "cartera") q = q.eq("status", "en_cartera");
  else if (ver === "depositados") q = q.eq("status", "depositado");
  else if (ver === "rechazados") q = q.eq("status", "rechazado");
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
    deposited_at: string | null;
    credited_at: string | null;
    rejected_at: string | null;
    rejection_reason: string | null;
    rejection_document_id: string | null;
    supplier_debit_document_id: string | null;
    received: { name: string } | null;
    delivered: { name: string } | null;
  }[];
  const total = cheques.reduce((s, c) => s + Number(c.amount), 0);
  const today = new Date().toISOString().slice(0, 10);
  const cur = ctx.org.base_currency;

  return (
    <>
      <PageHeader title="Cheques" description="Seguimiento de cheques y eCheqs: pendientes, depositados, cobrados y rechazados." />
      {error ? <Alert tone="error" className="mb-4">{error}</Alert> : null}
      <nav className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Vista">
        {VIEWS.map(([v, label]) => (
          <Link
            key={v}
            href={`/app/cheques?ver=${v}`}
            aria-current={ver === v ? "page" : undefined}
            className={cn("h-10 shrink-0 rounded-full border px-4 text-sm font-medium leading-10", ver === v ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted")}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Card className="mb-4">
        <CardContent className="pt-5">
          <p className="text-sm text-muted-foreground">Total ({cheques.length} cheques)</p>
          <p className="text-3xl font-bold tabular">{formatMoney(total, cur)}</p>
        </CardContent>
      </Card>
      {cheques.length === 0 ? (
        <EmptyState title="No hay cheques en esta vista" description="Los cheques se cargan al registrar un recibo o una orden de pago." />
      ) : (
        <ul className="space-y-3">
          {cheques.map((c) => {
            const st = STATUS[c.status] ?? { label: c.status, variant: "outline" as const };
            return (
              <li key={c.id} className="rounded-xl border bg-card p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {c.bank} Nº {c.number} {c.electronic ? <Badge variant="outline">eCheq</Badge> : null}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Vence {formatDate(`${c.payment_date}T12:00:00`)}
                      {c.payment_date < today && c.status === "en_cartera" ? <Badge variant="destructive" className="ml-2">Vencido</Badge> : null}
                      {c.drawer_name ? ` · librador ${c.drawer_name}` : ""}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {c.received ? `Recibido de ${c.received.name}` : c.kind === "propio" ? "Cheque propio" : ""}
                      {c.delivered ? ` · entregado a ${c.delivered.name}` : ""}
                      {c.deposited_at ? ` · depositado ${formatDate(`${c.deposited_at}T12:00:00`)}` : ""}
                      {c.credited_at ? ` · cobrado ${formatDate(`${c.credited_at}T12:00:00`)}` : ""}
                    </p>
                    {c.status === "rechazado" ? (
                      <p className="mt-1 text-sm">
                        Rechazado {c.rejected_at ? formatDate(`${c.rejected_at}T12:00:00`) : ""}
                        {c.rejection_reason ? ` (${c.rejection_reason})` : ""}.{" "}
                        {c.rejection_document_id ? (
                          <Link href={`/app/comprobantes/${c.rejection_document_id}`} className="font-medium text-primary hover:underline">
                            Ver nota de débito al cliente
                          </Link>
                        ) : null}
                        {c.supplier_debit_document_id ? (
                          <>
                            {" · "}
                            <Link href={`/app/comprobantes/${c.supplier_debit_document_id}`} className="font-medium text-primary hover:underline">
                              Ver débito del proveedor
                            </Link>
                          </>
                        ) : null}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
                    <p className="text-lg font-bold tabular">{formatMoney(Number(c.amount), cur)}</p>
                    <Badge variant={st.variant}>{st.label}</Badge>
                    <div className="flex flex-wrap gap-2">
                      {ACTIONS[c.status]?.map((a) => (
                        <form key={a.status} action={updateChequeStatus}>
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="status" value={a.status} />
                          <Button size="sm" variant="secondary">
                            {a.label}
                          </Button>
                        </form>
                      ))}
                    </div>
                  </div>
                </div>
                {REJECTABLE.includes(c.status) ? (
                  <details className="mt-3 rounded-lg border bg-muted/40 p-3">
                    <summary className="cursor-pointer text-sm font-medium text-destructive">Registrar rechazo</summary>
                    <form action={rejectCheque} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
                      <input type="hidden" name="id" value={c.id} />
                      <label className="text-sm">
                        Gastos bancarios ({cur}, sin IVA)
                        <Input name="fee" type="number" inputMode="decimal" step="any" min={0} defaultValue={0} />
                      </label>
                      <label className="text-sm">
                        Motivo
                        <Input name="reason" placeholder="Ej: sin fondos" />
                      </label>
                      <Button variant="destructive">Rechazar</Button>
                      <p className="text-xs text-muted-foreground sm:col-span-3">
                        {c.received ? `Se genera una nota de débito a ${c.received.name} por el cheque más los gastos (con IVA 21%). ` : ""}
                        {c.delivered ? `Se registra el débito de ${c.delivered.name}, que vuelve a cobrarnos el cheque.` : ""}
                      </p>
                    </form>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
