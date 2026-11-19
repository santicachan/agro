import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, EmptyState, PageHeader } from "@/components/ui/misc";
import { ChequeNotesForm } from "@/components/crm/cheque-notes-form";
import { LedgerBadge } from "@/components/crm/ledger-tabs";
import { requireCrm } from "@/lib/auth";
import { createChequeNotes } from "@/lib/crm/actions";
import { DOC_TYPES, documentLabel, formatDocNumber, type DocType } from "@/lib/crm/documents";
import { rateOn } from "@/lib/crm/ledger";
import { fxHistory } from "@/lib/crm/queries";
import { fetchFx } from "@/lib/prices/sources/fx";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Notas por cheques rechazados" };

type Cheque = {
  id: string;
  bank: string;
  number: string;
  amount: number;
  currency: string | null;
  payment_date: string;
  rejected_at: string | null;
  rejection_reason: string | null;
  received_from: string | null;
  delivered_to: string | null;
  received_document_id: string | null;
  delivered_document_id: string | null;
  rejection_document_id: string | null;
  supplier_debit_document_id: string | null;
  received: { name: string } | null;
  delivered: { name: string } | null;
};

type NoteDoc = { id: string; type: DocType; letter: string | null; point_of_sale: number; number: number; issue_date: string; total: number; currency: string; concept: string | null; ledger: string; meta: { chequeId?: string } | null };

export default async function ChequeNotesPage({ searchParams }: { searchParams: Promise<{ cheque?: string; error?: string; ok?: string; rechazado?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireCrm();
  const base = ctx.org.base_currency;
  let q = ctx.supabase
    .from("cheques")
    .select(
      "id, bank, number, amount, currency, payment_date, rejected_at, rejection_reason, received_from, delivered_to, received_document_id, delivered_document_id, rejection_document_id, supplier_debit_document_id, received:parties!cheques_received_from_fkey(name), delivered:parties!cheques_delivered_to_fkey(name)",
    )
    .eq("org_id", ctx.org.id)
    .eq("status", "rechazado")
    .order("rejected_at", { ascending: false });
  if (sp.cheque) q = q.eq("id", sp.cheque);
  const { data } = await q.limit(50);
  const cheques = (data ?? []) as unknown as Cheque[];

  const ids = cheques.map((c) => c.id);
  const sourceIds = cheques.flatMap((c) => [c.received_document_id, c.delivered_document_id, c.rejection_document_id, c.supplier_debit_document_id]).filter((x): x is string => !!x);
  const [{ data: notes }, { data: sources }, { data: apps }, history, fx] = await Promise.all([
    ids.length
      ? ctx.supabase
          .from("documents")
          .select("id, type, letter, point_of_sale, number, issue_date, total, currency, concept, ledger, meta")
          .eq("org_id", ctx.org.id)
          .in("concept", ["diferencia_cambio", "cheque_rechazado"])
          .order("issue_date")
      : Promise.resolve({ data: [] }),
    sourceIds.length ? ctx.supabase.from("documents").select("id, ledger, usd_rate, fx_rate, currency").in("id", sourceIds) : Promise.resolve({ data: [] }),
    // USD invoices cancelled by the receipts that carried these cheques → rate of the invoice day.
    sourceIds.length
      ? ctx.supabase
          .from("applications")
          .select("payment_document_id, amount, invoice:documents!applications_invoice_document_id_fkey(currency, fx_rate, document_lines(vat_rate))")
          .in("payment_document_id", sourceIds)
      : Promise.resolve({ data: [] }),
    fxHistory(ctx),
    fetchFx().catch(() => ({ items: [] as { pair: string; sell: number }[] })),
  ]);
  const today = fx.items.find((f) => f.pair === (base === "BRL" ? "USD/BRL" : "USD/ARS"))?.sell ?? null;
  const docMeta = new Map(((sources ?? []) as { id: string; ledger: string; usd_rate: number | null; fx_rate: number; currency: string }[]).map((d) => [d.id, d]));
  const notesByCheque = new Map<string, NoteDoc[]>();
  for (const n of (notes ?? []) as NoteDoc[]) {
    const id = n.meta?.chequeId;
    if (!id || !ids.includes(id)) continue;
    if (cheques.some((c) => c.rejection_document_id === n.id || c.supplier_debit_document_id === n.id)) continue;
    notesByCheque.set(id, [...(notesByCheque.get(id) ?? []), n]);
  }
  const appsByPayment = new Map<string, { amount: number; invoice: { currency: string; fx_rate: number; document_lines: { vat_rate: number }[] } | null }[]>();
  for (const a of (apps ?? []) as unknown as { payment_document_id: string; amount: number; invoice: { currency: string; fx_rate: number; document_lines: { vat_rate: number }[] } | null }[]) {
    appsByPayment.set(a.payment_document_id, [...(appsByPayment.get(a.payment_document_id) ?? []), a]);
  }

  const defaultsFor = (c: Cheque) => {
    const payment = c.received_document_id ?? c.delivered_document_id;
    const usdApps = (payment ? (appsByPayment.get(payment) ?? []) : []).filter((a) => a.invoice && a.invoice.currency === "USD");
    const weight = usdApps.reduce((s, a) => s + Number(a.amount), 0);
    const invoiceFx = weight > 0 ? Math.round((usdApps.reduce((s, a) => s + Number(a.amount) * Number(a.invoice!.fx_rate), 0) / weight) * 100) / 100 : null;
    const rates = usdApps.flatMap((a) => a.invoice!.document_lines.map((l) => Number(l.vat_rate)));
    const vatRate = rates.length && rates.every((r) => r === rates[0]) ? rates[0] : 21;
    const date = c.rejected_at ?? c.payment_date;
    const receiptRate = payment ? Number(docMeta.get(payment)?.usd_rate) || null : null;
    return {
      base: Number(c.amount),
      invoiceFx: invoiceFx ?? receiptRate,
      collectionFx: rateOn(history, date, today),
      date,
      vatRate,
    };
  };

  return (
    <>
      <PageHeader
        title="Notas por cheques rechazados"
        description="Gastos bancarios y diferencia de tipo de cambio entre el día de la factura y el día de cobro. Si el dólar subió se emite una nota de débito; si bajó, una de crédito."
        actions={
          <Link href="/app/cheques?ver=rechazados" className="text-sm font-medium text-primary hover:underline">
            Volver a cheques
          </Link>
        }
      />
      {sp.error ? <Alert tone="error" className="mb-4">{sp.error}</Alert> : null}
      {sp.rechazado ? <Alert className="mb-4">Cheque rechazado: la deuda quedó actualizada al día de la fecha de cobro. Si corresponde, generá ahora la nota por gastos y diferencia de cambio.</Alert> : null}
      {sp.ok ? <Alert className="mb-4">Listo: se generaron {sp.ok} notas y ya impactan en la cuenta corriente.</Alert> : null}
      {sp.cheque ? (
        <p className="mb-4 text-sm">
          <Link href="/app/cheques/notas" className="text-primary hover:underline">
            Ver todos los cheques rechazados
          </Link>
        </p>
      ) : null}
      {cheques.length === 0 ? (
        <EmptyState title="No hay cheques rechazados" description="Cuando registres el rechazo de un cheque vas a poder facturar acá los gastos y la diferencia de cambio." />
      ) : (
        <div className="space-y-4">
          {cheques.map((c) => {
            const party = c.received?.name ?? c.delivered?.name ?? "";
            const sourceId = c.received_from ? c.rejection_document_id : c.supplier_debit_document_id;
            const ledger = docMeta.get(sourceId ?? c.received_document_id ?? c.delivered_document_id ?? "")?.ledger ?? "blanco";
            const generated = notesByCheque.get(c.id) ?? [];
            return (
              <Card key={c.id}>
                <CardHeader>
                  <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
                    {c.bank} Nº {c.number} <Badge variant="destructive">Rechazado</Badge> <LedgerBadge ledger={ledger} />
                  </CardTitle>
                  <CardDescription>
                    {formatMoney(Number(c.amount), c.currency ?? base)} · {c.received ? `recibido de ${party}` : `entregado a ${party}`} · fecha de cobro{" "}
                    {formatDate(`${(c.rejected_at ?? c.payment_date)}T12:00:00`)}
                    {c.rejection_reason ? ` · ${c.rejection_reason}` : ""}
                    {sourceId ? (
                      <>
                        {" · "}
                        <Link href={`/app/comprobantes/${sourceId}`} className="text-primary hover:underline">
                          Ver nota de débito del rechazo
                        </Link>
                      </>
                    ) : null}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-6 lg:grid-cols-[1fr_280px]">
                  {(c.currency ?? base) !== base ? (
                    <p className="text-sm text-muted-foreground">Cheque en {c.currency}: la deuda ya se reabrió en dólares, no corresponde diferencia de cambio.</p>
                  ) : (
                    <ChequeNotesForm
                      action={createChequeNotes}
                      chequeId={c.id}
                      side={c.received_from ? "venta" : "compra"}
                      gestion={ledger === "gestion"}
                      baseCurrency={base}
                      defaults={defaultsFor(c)}
                    />
                  )}
                  <div>
                    <p className="mb-2 text-sm font-semibold">Notas ya generadas</p>
                    {generated.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Ninguna todavía.</p>
                    ) : (
                      <ul className="space-y-1 text-sm">
                        {generated.map((n) => (
                          <li key={n.id} className="flex justify-between gap-2">
                            <Link href={`/app/comprobantes/${n.id}`} className="text-primary hover:underline">
                              {DOC_TYPES[n.type].short} {n.letter ?? ""} {formatDocNumber(n.point_of_sale, n.number)}
                            </Link>
                            <span className="tabular text-muted-foreground" title={documentLabel(n.type, n.concept, n.ledger)}>
                              {formatMoney(Number(n.total), n.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
