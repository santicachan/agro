"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import { createPayment, type PaymentPayload } from "@/lib/crm/actions";
import { DOC_TYPES, exchangeDifference, formatDocNumber, type DocType, type Letter } from "@/lib/crm/documents";
import { formatDate, formatMoney } from "@/lib/format";

type Method = PaymentPayload["items"][number]["method"];
const METHODS: { value: Method; label: string }[] = [
  { value: "transferencia", label: "Transferencia" },
  { value: "efectivo", label: "Efectivo" },
  { value: "cheque", label: "Cheque" },
  { value: "echeq", label: "eCheq" },
  { value: "retencion", label: "Retención" },
  { value: "granos", label: "Granos (canje)" },
];

interface Item {
  method: Method;
  amount: string;
  reference: string;
  chequeId: string;
  bank: string;
  number: string;
  drawerName: string;
  paymentDate: string;
}

interface OpenItem {
  id: string;
  type: DocType;
  letter: Letter | null;
  point_of_sale: number;
  number: number;
  issue_date: string;
  currency: string;
  fx_rate: number;
  total: number;
  pending: number;
  vat?: number;
}

const newItem = (): Item => ({ method: "transferencia", amount: "", reference: "", chequeId: "", bank: "", number: "", drawerName: "", paymentDate: "" });

export function PaymentForm({
  type,
  parties,
  partyId,
  openItems,
  portfolio,
  baseCurrency,
  usdRate,
}: {
  type: "recibo" | "orden_pago";
  parties: { id: string; name: string }[];
  partyId?: string;
  openItems: OpenItem[];
  portfolio: { id: string; bank: string; number: string; amount: number; payment_date: string }[];
  baseCurrency: string;
  usdRate: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fxRate, setFxRate] = useState(String(usdRate ?? 1));
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const hasForeign = openItems.some((o) => o.currency !== baseCurrency);
  const fx = Number(fxRate) || 1;

  const paid = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const appliedRows = openItems
    .filter((o) => applied[o.id] !== undefined)
    .map((o) => {
      const amount = Number(applied[o.id]) || 0;
      const foreign = o.currency !== baseCurrency;
      const base = amount * (foreign ? fx : 1);
      const diff =
        foreign && o.type === "factura_venta"
          ? exchangeDifference({ foreignTotal: o.total, foreignVat: o.vat ?? 0, invoiceFx: o.fx_rate, paymentFx: fx, appliedFraction: Math.min(1, amount / o.total) })
          : null;
      return { o, amount, base, diff };
    });
  const appliedBase = appliedRows.reduce((s, r) => s + r.base, 0);
  const updateItem = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function submit() {
    setError(undefined);
    const payload: PaymentPayload = {
      type,
      partyId: partyId ?? "",
      issueDate,
      fxRate: fx,
      notes: notes || undefined,
      items: items.map((i) => ({
        method: i.method,
        amount: Number(i.amount),
        reference: i.reference || undefined,
        chequeId: i.chequeId || undefined,
        cheque:
          (i.method === "cheque" || i.method === "echeq") && !i.chequeId
            ? { bank: i.bank, number: i.number, drawerName: i.drawerName || undefined, paymentDate: i.paymentDate }
            : undefined,
      })),
      applications: appliedRows.filter((r) => r.amount > 0).map((r) => ({ invoiceId: r.o.id, amount: r.amount })),
    };
    start(async () => {
      const res = await createPayment(payload);
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/app/comprobantes/${res.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={type === "recibo" ? "Cliente" : "Proveedor"} htmlFor="party" className="sm:col-span-2">
            <Select
              id="party"
              value={partyId ?? ""}
              onChange={(e) => router.push(`/app/comprobantes/nuevo?tipo=${type}&party=${e.target.value}`)}
            >
              <option value="">Elegí…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha" htmlFor="date">
            <Input id="date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          {hasForeign ? (
            <Field label={`Tipo de cambio del pago (${baseCurrency}/USD)`} htmlFor="fx" hint="Se usa para cancelar comprobantes en dólares y calcular la diferencia de cambio.">
              <Input id="fx" type="number" inputMode="decimal" step="any" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      {partyId ? (
        <Card>
          <CardHeader>
            <CardTitle>Comprobantes pendientes</CardTitle>
            <CardDescription>Marcá lo que se cancela con este {type === "recibo" ? "cobro" : "pago"}.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {openItems.length === 0 ? <p className="text-muted-foreground">No hay comprobantes pendientes: quedará como pago a cuenta.</p> : null}
            {openItems.map((o) => {
              const checked = applied[o.id] !== undefined;
              const row = appliedRows.find((r) => r.o.id === o.id);
              return (
                <label key={o.id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                  <input
                    type="checkbox"
                    className="size-6 accent-[var(--primary)]"
                    checked={checked}
                    onChange={(e) =>
                      setApplied((a) => {
                        const next = { ...a };
                        if (e.target.checked) next[o.id] = String(o.pending);
                        else delete next[o.id];
                        return next;
                      })
                    }
                  />
                  <div className="min-w-40 flex-1">
                    <p className="font-medium">
                      {DOC_TYPES[o.type].short} {o.letter} {formatDocNumber(o.point_of_sale, o.number)}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatDate(`${o.issue_date}T12:00:00`)} · pendiente {formatMoney(o.pending, o.currency)}
                      {o.currency !== baseCurrency ? ` (TC ${o.fx_rate})` : ""}
                    </p>
                  </div>
                  {checked ? (
                    <Input
                      aria-label="Importe a cancelar"
                      className="w-40"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      value={applied[o.id]}
                      onChange={(e) => setApplied((a) => ({ ...a, [o.id]: e.target.value }))}
                    />
                  ) : null}
                  {row?.diff && !row.diff.isZero ? (
                    <Badge variant="accent">
                      {row.diff.type === "nota_debito_venta" ? "ND" : "NC"} dif. cambio {formatMoney(row.diff.total, baseCurrency)}
                    </Badge>
                  ) : null}
                </label>
              );
            })}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Medios de pago</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {items.map((it, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <Field label="Medio" htmlFor={`m${i}`}>
                  <Select id={`m${i}`} value={it.method} onChange={(e) => updateItem(i, { method: e.target.value as Method, chequeId: "" })}>
                    {METHODS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={`Importe (${baseCurrency})`} htmlFor={`a${i}`}>
                  <Input id={`a${i}`} type="number" inputMode="decimal" step="any" value={it.amount} onChange={(e) => updateItem(i, { amount: e.target.value })} />
                </Field>
                <Field label="Referencia" htmlFor={`r${i}`}>
                  <Input id={`r${i}`} value={it.reference} onChange={(e) => updateItem(i, { reference: e.target.value })} placeholder="Nº de operación" />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar" disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              {it.method === "cheque" || it.method === "echeq" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {type === "orden_pago" && portfolio.length ? (
                    <Field label="Endosar cheque de cartera" htmlFor={`cq${i}`} className="sm:col-span-2">
                      <Select
                        id={`cq${i}`}
                        value={it.chequeId}
                        onChange={(e) => {
                          const c = portfolio.find((p) => p.id === e.target.value);
                          updateItem(i, { chequeId: e.target.value, amount: c ? String(c.amount) : it.amount });
                        }}
                      >
                        <option value="">No, emitir cheque propio</option>
                        {portfolio.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.bank} #{c.number} — {formatMoney(c.amount, baseCurrency)} — vence {formatDate(`${c.payment_date}T12:00:00`)}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ) : null}
                  {!it.chequeId ? (
                    <>
                      <Field label="Banco" htmlFor={`b${i}`}>
                        <Input id={`b${i}`} value={it.bank} onChange={(e) => updateItem(i, { bank: e.target.value })} />
                      </Field>
                      <Field label="Número" htmlFor={`n${i}`}>
                        <Input id={`n${i}`} value={it.number} onChange={(e) => updateItem(i, { number: e.target.value })} />
                      </Field>
                      <Field label="Librador" htmlFor={`l${i}`}>
                        <Input id={`l${i}`} value={it.drawerName} onChange={(e) => updateItem(i, { drawerName: e.target.value })} />
                      </Field>
                      <Field label="Fecha de pago" htmlFor={`f${i}`}>
                        <Input id={`f${i}`} type="date" value={it.paymentDate} onChange={(e) => updateItem(i, { paymentDate: e.target.value })} />
                      </Field>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setItems((xs) => [...xs, newItem()])}>
            <Plus /> Otro medio de pago
          </Button>
          <Field label="Observaciones" htmlFor="notes">
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card className="sticky bottom-20 lg:bottom-4">
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm tabular">
            <p>Cancelado: {formatMoney(appliedBase, baseCurrency)}</p>
            <p className="text-2xl font-bold">{formatMoney(paid, baseCurrency)}</p>
          </div>
          <Button size="lg" onClick={submit} disabled={pending || !partyId || paid <= 0}>
            {pending ? "Guardando…" : type === "recibo" ? "Emitir recibo" : "Emitir orden de pago"}
          </Button>
        </CardContent>
        {error ? (
          <div className="px-5 pb-5">
            <Alert tone="error">{error}</Alert>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
