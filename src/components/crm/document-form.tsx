"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Alert } from "@/components/ui/misc";
import { createDocument, type DocumentPayload } from "@/lib/crm/actions";
import { DOC_TYPES, computeTotals, documentLabel, formatDocNumber, type DocType } from "@/lib/crm/documents";
import type { Ledger } from "@/lib/crm/ledger";
import { LedgerSwitch } from "./ledger-switch";
import { formatDate, formatMoney } from "@/lib/format";

export interface Associable {
  id: string;
  type: DocType;
  letter: string | null;
  point_of_sale: number;
  number: number;
  issue_date: string;
  currency: string;
  fx_rate: number;
  total: number;
}

const NOTE_TYPES: DocType[] = ["nota_credito_venta", "nota_debito_venta", "nota_credito_compra", "nota_debito_compra"];

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
  associable = [],
  sourceId,
  ledger = "blanco",
}: {
  type: DocType;
  parties: { id: string; name: string }[];
  partyId?: string;
  baseCurrency: string;
  vatRates: number[];
  usdRate: number | null;
  associable?: Associable[];
  sourceId?: string;
  ledger?: Ledger;
}) {
  const isNote = NOTE_TYPES.includes(type);
  const gestion = ledger === "gestion";
  // ARCA requires the associated invoice; internal Gestión notes don't.
  const requiresSource = !gestion && (type === "nota_credito_venta" || type === "nota_debito_venta");
  const initialSource = associable.find((a) => a.id === sourceId);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string>();
  const defaultVat = vatRates.includes(21) ? 21 : vatRates.at(-1) ?? 0;
  const [party, setParty] = useState(partyId ?? "");
  const [source, setSource] = useState(initialSource?.id ?? "");
  const [currency, setCurrency] = useState(initialSource?.currency ?? baseCurrency);
  const [fxRate, setFxRate] = useState(String(initialSource && initialSource.currency !== baseCurrency ? (usdRate ?? initialSource.fx_rate) : (usdRate ?? "")));
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState("");
  const isPurchase = DOC_TYPES[type].side === "compra";
  const [supplierPos, setSupplierPos] = useState("");
  const [supplierNumber, setSupplierNumber] = useState("");
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
      sourceDocumentId: source || undefined,
      ledger,
      usdRate: Number(fxRate) > 0 ? Number(fxRate) : undefined,
      ...(isPurchase && supplierPos ? { pointOfSale: Number(supplierPos) } : {}),
      ...(isPurchase && supplierNumber ? { number: Number(supplierNumber) } : {}),
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
      <LedgerSwitch type={type} ledger={ledger} partyId={party || undefined} />
      <Card>
        <CardContent className="grid gap-4 pt-5 sm:grid-cols-2">
          <Field label={DOC_TYPES[type].side === "venta" ? "Cliente" : "Proveedor"} htmlFor="party" className="sm:col-span-2">
            <Select
              id="party"
              value={party}
              onChange={(e) => {
                setParty(e.target.value);
                // Notes need the party's invoices to associate: reload with the new party.
                if (isNote) router.push(`/app/comprobantes/nuevo?tipo=${type}&party=${e.target.value}${gestion ? "&cuenta=gestion" : ""}`);
              }}
              required
            >
              <option value="">Elegí…</option>
              {parties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          {isNote && party ? (
            <Field
              label={requiresSource ? "Comprobante asociado (obligatorio para ARCA)" : "Comprobante asociado"}
              htmlFor="source"
              className="sm:col-span-2"
              hint={type.startsWith("nota_credito") ? "La nota de crédito descuenta del saldo de ese comprobante." : "La nota de débito queda vinculada a ese comprobante."}
            >
              <Select
                id="source"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  const a = associable.find((x) => x.id === e.target.value);
                  if (a) setCurrency(a.currency);
                }}
              >
                <option value="">{associable.length ? "Elegí el comprobante…" : "Este cliente no tiene comprobantes para asociar"}</option>
                {associable.map((a) => (
                  <option key={a.id} value={a.id}>
                    {DOC_TYPES[a.type].short} {a.letter ?? ""} {formatDocNumber(a.point_of_sale, a.number)} · {formatDate(`${a.issue_date}T12:00:00`)} · {formatMoney(Number(a.total), a.currency)}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {isPurchase ? (
            <>
              <Field label="Punto de venta del proveedor" htmlFor="supplierPos" hint="Figura en el comprobante, ej. 00012">
                <Input id="supplierPos" type="number" inputMode="numeric" min={1} max={99999} value={supplierPos} onChange={(e) => setSupplierPos(e.target.value)} />
              </Field>
              <Field label="Número de comprobante" htmlFor="supplierNumber" hint={gestion ? "Opcional en Gestión" : "Necesario para el Libro IVA Compras"}>
                <Input id="supplierNumber" type="number" inputMode="numeric" min={1} value={supplierNumber} onChange={(e) => setSupplierNumber(e.target.value)} />
              </Field>
            </>
          ) : null}
          <Field label="Fecha" htmlFor="issueDate">
            <Input id="issueDate" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </Field>
          <Field label="Vencimiento" htmlFor="dueDate">
            <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Moneda" htmlFor="currency">
            <Select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={Boolean(source)}>
              <option value={baseCurrency}>{baseCurrency}</option>
              {baseCurrency !== "USD" ? <option value="USD">USD</option> : null}
            </Select>
          </Field>
          {baseCurrency !== "USD" ? (
            <Field
              label={`Tipo de cambio (${baseCurrency} por USD)`}
              htmlFor="fx"
              hint={currency !== baseCurrency ? "Por defecto, dólar mayorista del día." : "Referencia para ver la cuenta corriente en dólares."}
            >
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
          <Button size="lg" onClick={submit} disabled={pending || !party || (requiresSource && !source) || (type === "factura_compra" && !gestion && (!supplierPos || !supplierNumber))}>
            {pending ? "Guardando…" : `Emitir ${gestion && type.startsWith("factura") ? `${documentLabel(type, null, "gestion").toLowerCase()} X` : DOC_TYPES[type].label.toLowerCase()}`}
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
