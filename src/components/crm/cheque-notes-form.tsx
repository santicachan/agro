"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { chequeAdjustment } from "@/lib/crm/cheque-adjustments";
import { DOC_TYPES } from "@/lib/crm/documents";
import { formatMoney } from "@/lib/format";

/** Bank fees + exchange difference of the collection day, with a live preview of the notes. */
export function ChequeNotesForm({
  action,
  chequeId,
  side,
  gestion,
  baseCurrency,
  defaults,
}: {
  action: (formData: FormData) => void | Promise<void>;
  chequeId: string;
  side: "venta" | "compra";
  gestion: boolean;
  baseCurrency: string;
  defaults: { base: number; invoiceFx: number | null; collectionFx: number | null; date: string; vatRate: number };
}) {
  const [fee, setFee] = useState("");
  const [feeVat, setFeeVat] = useState("21");
  const [base, setBase] = useState(String(defaults.base));
  const [invoiceFx, setInvoiceFx] = useState(defaults.invoiceFx ? String(defaults.invoiceFx) : "");
  const [collectionFx, setCollectionFx] = useState(defaults.collectionFx ? String(defaults.collectionFx) : "");
  const [diffVat, setDiffVat] = useState(String(defaults.vatRate));
  const [date, setDate] = useState(defaults.date);
  const plan = chequeAdjustment({
    side,
    fee: Number(fee) || 0,
    feeVatRate: gestion ? 0 : Number(feeVat) || 0,
    base: Number(base) || 0,
    invoiceFx: Number(invoiceFx) || 0,
    collectionFx: Number(collectionFx) || 0,
    diffVatRate: gestion ? 0 : Number(diffVat) || 0,
  });
  const vatOptions = [0, 10.5, 21, 27];

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={chequeId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={`Gastos bancarios (${baseCurrency}, sin IVA)`} htmlFor={`fee-${chequeId}`}>
          <Input id={`fee-${chequeId}`} name="fee" type="number" inputMode="decimal" step="any" min={0} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0" />
        </Field>
        {gestion ? (
          <input type="hidden" name="feeVatRate" value="0" />
        ) : (
          <Field label="IVA de los gastos" htmlFor={`feeVat-${chequeId}`}>
            <Select id={`feeVat-${chequeId}`} name="feeVatRate" value={feeVat} onChange={(e) => setFeeVat(e.target.value)}>
              {vatOptions.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label={`Importe a revaluar (${baseCurrency})`} htmlFor={`base-${chequeId}`} hint="Por defecto, el importe del cheque.">
          <Input id={`base-${chequeId}`} name="base" type="number" inputMode="decimal" step="any" min={0} value={base} onChange={(e) => setBase(e.target.value)} />
        </Field>
        <Field label="Fecha de cobro" htmlFor={`date-${chequeId}`} hint="Las notas quedan con esta fecha.">
          <Input id={`date-${chequeId}`} name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label={`TC del día de la factura (${baseCurrency}/USD)`} htmlFor={`ifx-${chequeId}`}>
          <Input id={`ifx-${chequeId}`} name="invoiceFx" type="number" inputMode="decimal" step="any" min={0} value={invoiceFx} onChange={(e) => setInvoiceFx(e.target.value)} />
        </Field>
        <Field label={`TC del día de cobro (${baseCurrency}/USD)`} htmlFor={`cfx-${chequeId}`}>
          <Input id={`cfx-${chequeId}`} name="collectionFx" type="number" inputMode="decimal" step="any" min={0} value={collectionFx} onChange={(e) => setCollectionFx(e.target.value)} />
        </Field>
        {gestion ? (
          <input type="hidden" name="diffVatRate" value="0" />
        ) : (
          <Field label="IVA incluido en la diferencia" htmlFor={`dvat-${chequeId}`} hint="La alícuota de la factura original.">
            <Select id={`dvat-${chequeId}`} name="diffVatRate" value={diffVat} onChange={(e) => setDiffVat(e.target.value)}>
              {vatOptions.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <div className="rounded-lg border bg-muted/40 p-3 text-sm">
        <p className="mb-2 font-semibold">Se va a generar</p>
        {plan.notes.length === 0 ? (
          <p className="text-muted-foreground">Nada todavía: cargá gastos bancarios o tipos de cambio distintos.</p>
        ) : (
          <ul className="space-y-2">
            {plan.notes.map((n, i) => (
              <li key={i}>
                <p className="flex justify-between gap-3 font-medium">
                  <span>
                    {DOC_TYPES[n.type].label}
                    {gestion ? " X" : ""} · {n.concept === "diferencia_cambio" ? "diferencia de cambio" : "gastos bancarios"}
                  </span>
                  <span className="tabular">{formatMoney(n.total, baseCurrency)}</span>
                </p>
                <ul className="text-xs text-muted-foreground">
                  {n.lines.map((l, j) => (
                    <li key={j}>
                      {l.description}: neto {formatMoney(l.net, baseCurrency)} + IVA {l.vatRate}% {formatMoney(l.vat, baseCurrency)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
      <Button type="submit" size="lg" disabled={plan.notes.length === 0}>
        Generar {plan.notes.length > 1 ? "notas" : "nota"}
      </Button>
    </form>
  );
}
