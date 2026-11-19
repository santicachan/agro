"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert, Badge } from "@/components/ui/misc";
import { createPayment, getOfficialRate, type PaymentPayload } from "@/lib/crm/actions";
import { fxSettlement } from "@/lib/crm/fx-settlement";
import { DOC_TYPES, exchangeDifference, formatDocNumber, type DocType, type Letter } from "@/lib/crm/documents";
import type { Ledger } from "@/lib/crm/ledger";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/crm/payloads";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { LedgerSwitch } from "./ledger-switch";

type Method = PaymentMethod;
const METHODS: { value: Method; label: string }[] = PAYMENT_METHODS.map((value) => ({ value, label: PAYMENT_METHOD_LABEL[value] }));
const REFERENCE_HINT: Partial<Record<Method, string>> = {
  granos: "Ej: 30 t soja, CP 123",
  insumo: "Ej: 20 bidones glifosato",
  vehiculo: "Ej: Toyota Hilux 2021, dominio AB123CD",
};

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
  /** Rate of the invoice day (peso invoices priced in dollars). */
  usd_rate?: number | null;
  /** Dollars already cancelled. */
  usd_paid?: number | null;
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
  ledger = "blanco",
  settleId,
}: {
  type: "recibo" | "orden_pago";
  parties: { id: string; name: string }[];
  partyId?: string;
  openItems: OpenItem[];
  portfolio: { id: string; bank: string; number: string; amount: number; payment_date: string; currency?: string | null }[];
  baseCurrency: string;
  usdRate: number | null;
  ledger?: Ledger;
  /** Invoice to settle (preselected, from "Cobrar y saldar"). */
  settleId?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fxRate, setFxRate] = useState(String(usdRate ?? ""));
  const fxTouched = useRef(false);
  const [fxSource, setFxSource] = useState<string | null>(usdRate ? "BCRA" : null);
  const [currency, setCurrency] = useState(baseCurrency);
  const payInBase = currency === baseCurrency;
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<Item[]>([newItem()]);
  const [applied, setApplied] = useState<Record<string, string>>(() => {
    const o = settleId ? openItems.find((x) => x.id === settleId) : undefined;
    return o ? { [o.id]: String(o.pending) } : {};
  });
  const [settle, setSettle] = useState<Record<string, boolean>>(() => (settleId ? { [settleId]: true } : {}));
  const fx = Number(fxRate) || 1;

  // Official BCRA rate of the payment day (unless typed by hand).
  useEffect(() => {
    if (fxTouched.current || baseCurrency === "USD") return;
    let alive = true;
    getOfficialRate(issueDate).then((r) => {
      if (!alive || fxTouched.current || !r) return;
      setFxRate(String(r.rate));
      setFxSource(`BCRA Com. A 3500 del ${formatDate(`${r.date}T12:00:00`)}`);
    });
    return () => {
      alive = false;
    };
  }, [issueDate, baseCurrency]);

  // Everything is cancelled in pesos: dollars are converted at the payment-day rate.
  const paid = items.reduce((s, i) => s + (Number(i.amount) || 0), 0);
  const paidBase = payInBase ? paid : Math.round(paid * fx * 100) / 100;
  const appliedRows = openItems
    .filter((o) => applied[o.id] !== undefined)
    .map((o) => {
      const amount = Number(applied[o.id]) || 0;
      const foreign = o.currency !== baseCurrency;
      if (!foreign && settle[o.id] && o.usd_rate) {
        const s = fxSettlement({
          side: type === "recibo" ? "venta" : "compra",
          totalArs: o.total,
          pendingArs: o.pending,
          invoiceRate: o.usd_rate,
          usdPaid: o.usd_paid ?? 0,
          paymentRate: fx,
          vatBases: [{ rate: 0, base: o.total }],
        });
        return { o, amount, base: s?.arsToSettle ?? 0, diff: null, settlement: s };
      }
      const base = amount * (foreign ? fx : 1);
      const diff =
        foreign && o.type === "factura_venta"
          ? exchangeDifference({ foreignTotal: o.total, foreignVat: o.vat ?? 0, invoiceFx: o.fx_rate, paymentFx: fx, appliedFraction: Math.min(1, amount / o.total) })
          : null;
      return { o, amount, base, diff, settlement: null };
    });
  const appliedBase = appliedRows.reduce((s, r) => s + r.base, 0);
  const onAccount = Math.round((paidBase - appliedBase) * 100) / 100;
  const updateItem = (i: number, patch: Partial<Item>) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  function submit() {
    setError(undefined);
    const payload: PaymentPayload = {
      type,
      partyId: partyId ?? "",
      issueDate,
      fxRate: Number(fxRate) > 0 ? Number(fxRate) : undefined,
      currency: currency as PaymentPayload["currency"],
      ledger,
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
      applications: appliedRows
        .filter((r) => r.settlement || r.amount > 0)
        .map((r) => (r.settlement ? { invoiceId: r.o.id, amount: 0, settle: true } : { invoiceId: r.o.id, amount: r.amount })),
    };
    start(async () => {
      const res = await createPayment(payload);
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/app/comprobantes/${res.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <LedgerSwitch type={type} ledger={ledger} partyId={partyId} />
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={type === "recibo" ? "Cliente" : "Proveedor"} htmlFor="party" className="sm:col-span-2">
            <Select
              id="party"
              value={partyId ?? ""}
              onChange={(e) => router.push(`/app/comprobantes/nuevo?tipo=${type}&party=${e.target.value}${ledger === "gestion" ? "&cuenta=gestion" : ""}`)}
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
          {baseCurrency !== "USD" ? (
            <Field label="Moneda del pago" htmlFor="payCurrency" hint={payInBase ? undefined : "Los dólares se pasan a pesos al tipo de cambio del día del pago y cancelan facturas en pesos."}>
              <Select id="payCurrency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                <option value={baseCurrency}>{baseCurrency === "ARS" ? "Pesos (ARS)" : baseCurrency}</option>
                <option value="USD">Dólares (USD)</option>
              </Select>
            </Field>
          ) : null}
          {baseCurrency !== "USD" ? (
            <Field
              label={`Tipo de cambio del pago (${baseCurrency}/USD)`}
              htmlFor="fx"
              hint={fxSource ? `Oficial ${fxSource}. Podés corregirlo.` : "Pesifica los dólares y calcula la diferencia de cambio."}
            >
              <Input
                id="fx"
                type="number"
                inputMode="decimal"
                step="any"
                value={fxRate}
                onChange={(e) => {
                  fxTouched.current = true;
                  setFxSource(null);
                  setFxRate(e.target.value);
                }}
              />
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
                        if (e.target.checked) {
                          const free = Math.max(0, paidBase - appliedBase);
                          next[o.id] = String(o.currency === baseCurrency && free > 0 ? Math.min(o.pending, Math.round(free * 100) / 100) : o.pending);
                        } else delete next[o.id];
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
                      {o.currency === baseCurrency && o.usd_rate ? ` · USD ${formatNumber(Math.max(0, o.total / o.usd_rate - (o.usd_paid ?? 0)), 2)} pendientes (TC factura ${formatNumber(o.usd_rate, 2)})` : ""}
                    </p>
                    {checked && o.currency === baseCurrency && o.usd_rate ? (
                      <span
                        role="checkbox"
                        aria-checked={!!settle[o.id]}
                        tabIndex={0}
                        className="mt-1 flex cursor-pointer items-center gap-2 text-sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSettle((x) => ({ ...x, [o.id]: !x[o.id] }));
                        }}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            setSettle((x) => ({ ...x, [o.id]: !x[o.id] }));
                          }
                        }}
                      >
                        <input type="checkbox" tabIndex={-1} aria-hidden className="pointer-events-none size-5 accent-[var(--primary)]" checked={!!settle[o.id]} readOnly />
                        Saldar con diferencia de cambio (ND/NC)
                      </span>
                    ) : null}
                  </div>
                  {checked && row?.settlement ? (
                    <div className="text-right text-sm tabular">
                      <p>Cancela {formatMoney(row.settlement.arsToSettle, baseCurrency)}</p>
                      {row.settlement.note ? (
                        <Badge variant="accent">
                          {row.settlement.difference > 0 ? "ND" : "NC"} dif. cambio {formatMoney(row.settlement.note.total, baseCurrency)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">Sin diferencia</span>
                      )}
                    </div>
                  ) : checked ? (
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
                <Field
                  label={`Importe (${currency})`}
                  htmlFor={`a${i}`}
                  hint={!payInBase && Number(it.amount) > 0 ? `= ${formatMoney(Number(it.amount) * fx, baseCurrency)}` : undefined}
                >
                  <Input id={`a${i}`} type="number" inputMode="decimal" step="any" value={it.amount} onChange={(e) => updateItem(i, { amount: e.target.value })} />
                </Field>
                <Field label="Referencia" htmlFor={`r${i}`}>
                  <Input id={`r${i}`} value={it.reference} onChange={(e) => updateItem(i, { reference: e.target.value })} placeholder={REFERENCE_HINT[it.method] ?? "Nº de operación"} />
                </Field>
                <Button type="button" variant="ghost" size="icon" aria-label="Quitar" disabled={items.length === 1} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))}>
                  <Trash2 />
                </Button>
              </div>
              {it.method === "cheque" || it.method === "echeq" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {type === "orden_pago" && portfolio.some((c) => (c.currency ?? baseCurrency) === currency) ? (
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
                        {portfolio
                          .filter((c) => (c.currency ?? baseCurrency) === currency)
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.bank} #{c.number} — {formatMoney(c.amount, c.currency ?? baseCurrency)} — vence {formatDate(`${c.payment_date}T12:00:00`)}
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
            {onAccount > 0.009 ? <p className="text-muted-foreground">Queda a cuenta: {formatMoney(onAccount, baseCurrency)}</p> : null}
            {onAccount < -0.009 ? <p className="text-destructive">Falta cubrir: {formatMoney(-onAccount, baseCurrency)}</p> : null}
            <p className="text-2xl font-bold">
              {formatMoney(paid, currency)}
              {!payInBase ? <span className="ml-2 text-base font-normal text-muted-foreground">= {formatMoney(paidBase, baseCurrency)}</span> : null}
            </p>
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
