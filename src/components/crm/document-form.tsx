"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { createDocument, type DocumentPayload } from "@/lib/crm/actions";
import { DOC_TYPES, computeTotals, type DocType } from "@/lib/crm/documents";
import { formatMoney } from "@/lib/format";

interface Line {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  vatRate: string;
}

const emptyLine = (vat: number): Line => ({ description: "", quantity: "1", unit: "u", unitPrice: "", vatRate: String(vat) });
const UNITS = ["u", "kg", "t", "qq", "L", "ha", "bolsa"];

export function DocumentForm({
  type,
  parties,
  partyId,
  baseCurrency,
  vatRates,
  usdRate,
}: {
  type: DocType;
  parties: { id: string; name: string }[];
  partyId?: string;
  baseCurrency: string;
  vatRates: number[];
  usdRate: number | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const defaultVat = vatRates.includes(21) ? 21 : vatRates.at(-1) ?? 0;
  const [party, setParty] = useState(partyId ?? "");
  const [currency, setCurrency] = useState(baseCurrency);
  const [fxRate, setFxRate] = useState(String(usdRate ?? 1));
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([emptyLine(defaultVat)]);

  const parsedLines = lines.map((l) => ({
    description: l.description,
    quantity: Number(l.quantity) || 0,
    unit: l.unit,
    unitPrice: Number(l.unitPrice) || 0,
    vatRate: Number(l.vatRate) || 0,
  }));
  const totals = computeTotals(parsedLines);
  const update = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  function submit() {
    setError(undefined);
    const payload: DocumentPayload = {
      type: type as DocumentPayload["type"],
      partyId: party,
      issueDate,
      dueDate: dueDate || undefined,
      currency: currency as DocumentPayload["currency"],
      fxRate: currency === baseCurrency ? 1 : Number(fxRate),
      notes: notes || undefined,
      lines: parsedLines,
    };
    start(async () => {
      const res = await createDocument(payload);
      if (res.error) setError(res.error);
      else if (res.id) router.push(`/app/comprobantes/${res.id}`);
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={DOC_TYPES[type].side === "venta" ? "Cliente" : "Proveedor"} htmlFor="party" className="sm:col-span-2">
            <Select id="party" value={party} onChange={(e) => setParty(e.target.value)} required>
              <option value="">Elegí…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Fecha" htmlFor="issueDate">
            <Input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="Vencimiento" htmlFor="dueDate">
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Moneda" htmlFor="currency">
            <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value={baseCurrency}>{baseCurrency}</option>
              {baseCurrency !== "USD" ? <option value="USD">USD</option> : null}
            </Select>
          </Field>
          {currency !== baseCurrency ? (
            <Field label={`Tipo de cambio (${baseCurrency} por USD)`} htmlFor="fx" hint="Por defecto, dólar mayorista del día.">
              <Input id="fx" type="number" inputMode="decimal" step="any" value={fxRate} onChange={(e) => setFxRate(e.target.value)} />
            </Field>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Detalle</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((l, i) => (
            <div key={i} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[2fr_90px_90px_120px_100px_auto] sm:items-end">
              <Field label="Descripción" htmlFor={`d${i}`}>
                <Input id={`d${i}`} value={l.description} onChange={(e) => update(i, { description: e.target.value })} placeholder="Ej: Glifosato 20 L" />
              </Field>
              <Field label="Cantidad" htmlFor={`q${i}`}>
                <Input id={`q${i}`} type="number" inputMode="decimal" step="any" value={l.quantity} onChange={(e) => update(i, { quantity: e.target.value })} />
              </Field>
              <Field label="Unidad" htmlFor={`u${i}`}>
                <Select id={`u${i}`} value={l.unit} onChange={(e) => update(i, { unit: e.target.value })}>
                  {UNITS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Precio unit. (sin IVA)" htmlFor={`p${i}`}>
                <Input id={`p${i}`} type="number" inputMode="decimal" step="any" value={l.unitPrice} onChange={(e) => update(i, { unitPrice: e.target.value })} />
              </Field>
              <Field label="IVA %" htmlFor={`v${i}`}>
                <Select id={`v${i}`} value={l.vatRate} onChange={(e) => update(i, { vatRate: e.target.value })}>
                  {vatRates.map((r) => (
                    <option key={r} value={r}>
                      {r}%
                    </option>
                  ))}
                </Select>
              </Field>
              <Button type="button" variant="ghost" size="icon" aria-label="Quitar renglón" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}>
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button type="button" variant="outline" onClick={() => setLines((ls) => [...ls, emptyLine(defaultVat)])}>
            <Plus /> Agregar renglón
          </Button>
          <Field label="Observaciones" htmlFor="notes">
            <Textarea id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </CardContent>
      </Card>

      <Card className="sticky bottom-20 lg:bottom-4">
        <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm tabular">
            <p>
              Neto {formatMoney(totals.net, currency)} · IVA {formatMoney(totals.vat, currency)}
            </p>
            <p className="text-2xl font-bold">{formatMoney(totals.total, currency)}</p>
          </div>
          <Button size="lg" onClick={submit} disabled={pending || !party}>
            {pending ? "Guardando…" : `Emitir ${DOC_TYPES[type].label.toLowerCase()}`}
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
