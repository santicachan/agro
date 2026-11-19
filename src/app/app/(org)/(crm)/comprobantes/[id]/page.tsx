import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftRight, Landmark, Link2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { DocBadges } from "@/components/crm/doc-badges";
import { LedgerBadge } from "@/components/crm/ledger-tabs";
import { PrintButton } from "@/components/crm/print-button";
import { requireCrm } from "@/lib/auth";
import { authorizeWithArca, invoiceFromRemito, remitoFromInvoice, settleFxDifference } from "@/lib/crm/actions";
import { fxSettlement } from "@/lib/crm/fx-settlement";
import { officialRate } from "@/lib/fx/official";
import { isArcaConfigured } from "@/lib/crm/arca";
import { DOC_TYPES, TAX_CONDITIONS, documentLabel, formatDocNumber, type DocType } from "@/lib/crm/documents";
import { PAYMENT_METHOD_LABEL, type PaymentMethod } from "@/lib/crm/payloads";
import { balancesFor, usdSettlementInfo, type DocumentRow } from "@/lib/crm/queries";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

export const metadata = { title: "Comprobante" };

type Ref = { id: string; type: DocType; letter: string | null; point_of_sale: number; number: number; issue_date: string; currency: string; total: number; concept: string | null; ledger?: string | null };
const refLabel = (d: Pick<Ref, "type" | "letter" | "point_of_sale" | "number">) => `${DOC_TYPES[d.type].short} ${d.letter ?? ""} ${formatDocNumber(d.point_of_sale, d.number)}`.replace(/\s+/g, " ");
const REF_COLS = "id, type, letter, point_of_sale, number, issue_date, currency, total, concept, ledger";

export default async function DocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; arca?: string; arca_errors?: string; cheque?: string; liquidado?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const ctx = await requireCrm();
  const { data } = await ctx.supabase
    .from("documents")
    .select("*, parties(name, tax_id, tax_condition), document_lines(*), payment_items(*, cheques(id, bank, number, payment_date, status))")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!data) notFound();
  const doc = data as DocumentRow & {
    document_lines: { id: string; description: string; quantity: number; unit: string; unit_price: number; vat_rate: number; net: number; vat: number }[];
    payment_items: { id: string; method: string; amount: number; reference: string | null; currency: string | null; fx_rate: number | null; amount_currency: number | null; cheques: { id: string; bank: string; number: string; payment_date: string; status: string } | null }[];
  };

  const [source, derived, cancelledBy, cancels, balances] = await Promise.all([
    doc.source_document_id
      ? ctx.supabase.from("documents").select(REF_COLS).eq("id", doc.source_document_id).maybeSingle().then((r) => r.data as Ref | null)
      : Promise.resolve(null),
    ctx.supabase.from("documents").select(REF_COLS).eq("source_document_id", id).eq("org_id", ctx.org.id).order("issue_date").then((r) => (r.data ?? []) as Ref[]),
    ctx.supabase
      .from("applications")
      .select(`amount, fx_rate, payment:documents!applications_payment_document_id_fkey(${REF_COLS})`)
      .eq("invoice_document_id", id)
      .then((r) => (r.data ?? []) as unknown as { amount: number; fx_rate: number; payment: Ref }[]),
    ctx.supabase
      .from("applications")
      .select(`amount, fx_rate, invoice:documents!applications_invoice_document_id_fkey(${REF_COLS})`)
      .eq("payment_document_id", id)
      .then((r) => (r.data ?? []) as unknown as { amount: number; fx_rate: number; invoice: Ref }[]),
    balancesFor(ctx, [id]),
  ]);

  const meta = DOC_TYPES[doc.type];
  const gestion = doc.ledger === "gestion";
  const fiscal = meta.fiscal && !gestion;
  const cuentaQs = gestion ? "&cuenta=gestion" : "";
  const pending = balances.get(id);
  const authorized = doc.status === "authorized";
  const canAuthorize = fiscal && !authorized && ["owner", "admin"].includes(ctx.role);
  const arca = doc.arca_response ?? null;
  const arcaErrors: string[] = sp.arca_errors ? (JSON.parse(sp.arca_errors) as string[]) : [];
  const fx = (doc.meta ?? {}) as {
    invoiceFx?: number;
    paymentFx?: number;
    appliedForeign?: number;
    invoiceCurrency?: string;
    bank?: string;
    number?: string;
    fee?: number;
    mode?: string;
    usdPending?: number;
    paidCurrency?: string;
    paidAmount?: number;
  };
  const cur = ctx.org.base_currency;
  const bcraRate = Number(doc.bcra_rate) > 0 ? Number(doc.bcra_rate) : null;

  // Peso invoice priced in dollars: dollars cancelled, dollars pending and the
  // difference a settlement today would generate (preview).
  const settleable = ["factura_venta", "nota_debito_venta", "factura_compra", "nota_debito_compra"].includes(doc.type) && doc.currency === cur && doc.concept == null;
  const usdInfo = settleable ? (await usdSettlementInfo(ctx, [id])).get(id) : undefined;
  const todayRate = settleable && usdInfo?.usd_rate ? await officialRate(ctx.supabase, new Date().toISOString().slice(0, 10)) : null;
  const settlement =
    settleable && usdInfo?.usd_rate && todayRate
      ? fxSettlement({
          side: meta.side === "venta" ? "venta" : "compra",
          totalArs: Number(doc.total),
          pendingArs: pending ?? 0,
          invoiceRate: usdInfo.usd_rate,
          usdPaid: usdInfo.usd_paid,
          paymentRate: todayRate.rate,
          vatBases: Object.entries(
            doc.document_lines.reduce<Record<string, number>>((acc, l) => ({ ...acc, [String(Number(l.vat_rate))]: (acc[String(Number(l.vat_rate))] ?? 0) + Number(l.net) }), {}),
          ).map(([rate, b]) => ({ rate: Number(rate), base: b })),
        })
      : null;
  const hasInvoice = derived.some((d) => d.type === "factura_venta");
  const hasRemito = derived.some((d) => d.type === "remito") || source?.type === "remito";
  const noteSide = meta.side === "venta" ? "venta" : "compra";

  return (
    <>
      <PageHeader
        title={`${documentLabel(doc.type, doc.concept, doc.ledger)} ${doc.letter ?? ""} ${formatDocNumber(doc.point_of_sale, doc.number)}`}
        description={`${formatDate(`${doc.issue_date}T12:00:00`)} · ${doc.parties?.name ?? ""} · Cuenta ${gestion ? "Gestión (interna)" : "Blanco"}`}
        actions={<PrintButton />}
      />

      {sp.error ? <Alert tone="error" className="mb-4">{sp.error}</Alert> : null}
      {sp.cheque === "rechazado" ? <Alert className="mb-4">Cheque rechazado: generamos esta nota de débito automáticamente y ya impacta en la cuenta corriente.</Alert> : null}
      {sp.liquidado ? <Alert className="mb-4">Diferencia de cambio liquidada: emitimos la nota y la imputamos a este comprobante.</Alert> : null}
      {sp.cheque === "nota" ? <Alert className="mb-4">Nota generada por el cheque rechazado. Ya impacta en la cuenta corriente.</Alert> : null}
      {gestion ? (
        <Alert tone="warning" className="mb-4">
          Comprobante de la cuenta <strong>Gestión</strong>: es interno, no se envía a ARCA y no aparece en los libros contables.
        </Alert>
      ) : null}
      {sp.arca === "ok" ? <Alert className="mb-4">Comprobante autorizado por ARCA.</Alert> : null}
      {sp.arca === "listo" ? (
        <Alert className="mb-4">
          <strong>Validado y listo para ARCA.</strong> Revisamos CUIT, letra, punto de venta, alícuotas y fecha, y dejamos armada la solicitud de CAE. Falta cargar el certificado digital
          de ARCA para enviarla (Configuración).
        </Alert>
      ) : null}
      {arcaErrors.length ? (
        <Alert tone="error" className="mb-4">
          <p className="mb-1 font-semibold">ARCA rechazaría este comprobante:</p>
          <ul className="list-disc pl-5">
            {arcaErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        {canAuthorize ? (
          <form action={authorizeWithArca.bind(null, doc.id)}>
            <Button size="lg">
              <Landmark /> Autorizar en ARCA
            </Button>
          </form>
        ) : null}
        {doc.type === "remito" && !hasInvoice ? (
          <form action={invoiceFromRemito.bind(null, doc.id)}>
            <Button size="lg" variant="secondary">Facturar este remito</Button>
          </form>
        ) : null}
        {doc.type === "factura_venta" && !hasRemito ? (
          <form action={remitoFromInvoice.bind(null, doc.id)}>
            <Button size="lg" variant="secondary">Generar remito</Button>
          </form>
        ) : null}
        {pending != null && pending > 0 && (meta.side === "venta" ? ["factura_venta", "nota_debito_venta"] : ["factura_compra", "nota_debito_compra"]).includes(doc.type) ? (
          <Button asChild size="lg" variant="secondary">
            <Link href={`/app/comprobantes/nuevo?tipo=${meta.side === "venta" ? "recibo" : "orden_pago"}&party=${doc.party_id}${cuentaQs}`}>{meta.side === "venta" ? "Cobrar" : "Pagar"}</Link>
          </Button>
        ) : null}
        {["factura_venta", "nota_debito_venta", "factura_compra", "nota_debito_compra"].includes(doc.type) ? (
          <>
            <Button asChild size="lg" variant="outline">
              <Link href={`/app/comprobantes/nuevo?tipo=nota_credito_${noteSide}&party=${doc.party_id}&origen=${doc.id}${cuentaQs}`}>Nota de crédito</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/app/comprobantes/nuevo?tipo=nota_debito_${noteSide}&party=${doc.party_id}&origen=${doc.id}${cuentaQs}`}>Nota de débito</Link>
            </Button>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
            <div>
              <CardTitle>{ctx.org.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {ctx.region.taxIdLabel} {ctx.org.tax_id ?? "—"} · {ctx.org.tax_condition ? TAX_CONDITIONS[ctx.org.tax_condition] : ""}
              </p>
            </div>
            <div className="text-right text-sm">
              <span className="flex flex-wrap justify-end gap-1">
                <LedgerBadge ledger={doc.ledger} />
                <DocBadges type={doc.type} total={Number(doc.total)} pending={pending} status={doc.status} concept={doc.concept} fiscal={fiscal} arcaStatus={arca?.status} />
              </span>
              <p className="mt-2 font-semibold">{doc.parties?.name}</p>
              <p className="text-muted-foreground">
                {doc.parties?.tax_id ?? ""} {doc.parties?.tax_condition ? `· ${TAX_CONDITIONS[doc.parties.tax_condition]}` : ""}
              </p>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {doc.concept === "diferencia_cambio" && fx.mode === "liquidacion" ? (
              <div className="flex items-start gap-3 rounded-lg bg-secondary p-3 text-sm">
                <ArrowLeftRight className="mt-0.5 size-5 shrink-0" aria-hidden />
                <p>
                  Liquidación de la diferencia de cambio: la factura se pactó a TC {formatNumber(Number(fx.invoiceFx), 2)} y se saldó a TC {formatNumber(Number(fx.paymentFx), 2)}. El
                  cliente {doc.type.startsWith("nota_debito") ? "debe más" : "debe menos"} pesos por la variación del tipo de cambio.
                </p>
              </div>
            ) : doc.concept === "diferencia_cambio" && fx.invoiceFx ? (
              <div className="flex items-start gap-3 rounded-lg bg-secondary p-3 text-sm">
                <ArrowLeftRight className="mt-0.5 size-5 shrink-0" aria-hidden />
                <p>
                  Se cancelaron <strong>{fx.invoiceCurrency ?? "USD"} {formatNumber(Number(fx.appliedForeign ?? 0), 2)}</strong> facturados a TC {formatNumber(fx.invoiceFx, 2)} y cobrados a TC{" "}
                  {formatNumber(Number(fx.paymentFx), 2)}. La diferencia, con su IVA, se {doc.type.startsWith("nota_debito") ? "suma" : "descuenta"} en esta nota.
                </p>
              </div>
            ) : null}

            {doc.document_lines.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>Descripción</Th>
                    <Th className="text-right">Cant.</Th>
                    <Th className="text-right">Precio</Th>
                    <Th className="text-right">IVA</Th>
                    <Th className="text-right">Subtotal</Th>
                  </tr>
                </thead>
                <tbody>
                  {doc.document_lines.map((l) => (
                    <tr key={l.id}>
                      <Td>{l.description}</Td>
                      <Td className="text-right">
                        {formatNumber(Number(l.quantity), 3)} {l.unit}
                      </Td>
                      <Td className="text-right">{formatMoney(Number(l.unit_price), doc.currency)}</Td>
                      <Td className="text-right">{Number(l.vat_rate)}%</Td>
                      <Td className="text-right">{formatMoney(Number(l.net), doc.currency)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : null}

            {doc.payment_items.length ? (
              <div>
                <h3 className="mb-2 font-semibold">Medios de pago</h3>
                <ul className="space-y-1 text-sm">
                  {doc.payment_items.map((p) => (
                    <li key={p.id} className="flex justify-between gap-3 border-b py-2">
                      <span>
                        {PAYMENT_METHOD_LABEL[p.method as PaymentMethod] ?? p.method}
                        {p.cheques ? (
                          <>
                            {" — "}
                            <Link href="/app/cheques?ver=todos" className="hover:underline">
                              {p.cheques.bank} Nº {p.cheques.number}, vence {formatDate(`${p.cheques.payment_date}T12:00:00`)}
                            </Link>
                            {p.cheques.status === "rechazado" ? <Badge variant="destructive" className="ml-2">Rechazado</Badge> : null}
                          </>
                        ) : null}
                        {p.reference ? ` — ${p.reference}` : ""}
                        {p.currency && p.amount_currency != null ? (
                          <span className="block text-xs text-muted-foreground">
                            {formatMoney(Number(p.amount_currency), p.currency)} a TC {formatNumber(Number(p.fx_rate), 2)}
                          </span>
                        ) : null}
                      </span>
                      <span className="tabular">{formatMoney(Number(p.amount), doc.currency)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="ml-auto max-w-xs space-y-1 text-sm tabular">
              {meta.payment ? null : (
                <>
                  <Row label="Neto" value={formatMoney(Number(doc.net), doc.currency)} />
                  <Row label="IVA" value={formatMoney(Number(doc.vat), doc.currency)} />
                  {Number(doc.other_taxes) ? <Row label="Otros tributos" value={formatMoney(Number(doc.other_taxes), doc.currency)} /> : null}
                </>
              )}
              <div className="flex justify-between border-t pt-2 text-lg font-bold">
                <span>Total</span>
                <span>{formatMoney(Number(doc.total), doc.currency)}</span>
              </div>
              {doc.currency !== cur ? (
                <p className="text-right text-xs text-muted-foreground">
                  TC {formatNumber(Number(doc.fx_rate), 2)} = {formatMoney(Number(doc.total) * Number(doc.fx_rate), cur)}
                </p>
              ) : null}
              {pending != null && pending > 0 && !meta.payment ? <Row label="Saldo pendiente" value={formatMoney(pending, doc.currency)} /> : null}
            </div>
            {bcraRate ? (
              <div className="rounded-lg border p-3 text-sm">
                <p className="font-semibold">Tipo de cambio oficial BCRA (Com. A 3500)</p>
                <p className="tabular">
                  {formatMoney(bcraRate, cur)} por USD
                  {doc.bcra_rate_date ? ` · publicado el ${formatDate(`${doc.bcra_rate_date}T12:00:00`)}` : ""}
                  {doc.bcra_rate_date && doc.bcra_rate_date !== doc.issue_date ? " (último hábil a la fecha de emisión)" : ""}
                </p>
                {doc.currency === cur ? <p className="text-xs text-muted-foreground">Equivale a {formatMoney(Number(doc.total) / bcraRate, "USD")} al día de emisión.</p> : null}
              </div>
            ) : null}
            {doc.notes ? <p className="text-sm text-muted-foreground">{doc.notes}</p> : null}
          </CardContent>
        </Card>

        <div className="space-y-4">
          {fiscal ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Landmark className="size-5" aria-hidden /> Factura electrónica (ARCA)
                </CardTitle>
                <CardDescription>
                  {authorized ? "Autorizado. El comprobante quedó bloqueado." : arca?.status === "ready" ? "Validado y listo para pedir el CAE." : "Todavía sin CAE."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <Item label="Punto de venta" value={String(doc.point_of_sale).padStart(5, "0")} />
                  <Item label="Número" value={String(doc.number).padStart(8, "0")} />
                  <Item label="Letra" value={doc.letter ?? "—"} />
                  <Item label="Estado" value={authorized ? "Autorizado" : arca?.status === "ready" ? "Listo para ARCA" : arca?.status === "rejected" ? "Rechazado" : "Pendiente"} />
                  <Item label="CAE" value={doc.cae ?? "—"} wide />
                  <Item label="Vencimiento CAE" value={doc.cae_due ? formatDate(`${doc.cae_due}T12:00:00`) : "—"} wide />
                </dl>
                {authorized ? (
                  <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Lock className="size-4" aria-hidden /> No se puede editar ni borrar. Para corregirlo emití una nota de crédito.
                  </p>
                ) : !isArcaConfigured() ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    El envío a ARCA se activa al cargar el certificado digital. <Link href="/app/configuracion" className="text-primary hover:underline">Ver configuración</Link>
                  </p>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {settlement && usdInfo?.usd_rate ? (
            <Card className="print:hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ArrowLeftRight className="size-5" aria-hidden /> Diferencia de cambio
                </CardTitle>
                <CardDescription>Factura en pesos pactada a TC {formatNumber(usdInfo.usd_rate, 2)}. Lo que no se cubre por la variación del dólar queda pendiente hasta saldarla.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <dl className="grid grid-cols-2 gap-3">
                  <Item label="Valor en dólares" value={formatMoney(settlement.usdValue, "USD")} />
                  <Item label="Dólares cancelados" value={formatMoney(usdInfo.usd_paid, "USD")} />
                  <Item label="Dólares pendientes" value={formatMoney(settlement.usdPending, "USD")} />
                  <Item label="Pesos pendientes" value={formatMoney(pending ?? 0, cur)} />
                </dl>
                <div className="rounded-lg bg-secondary p-3">
                  <p className="font-medium">Vista previa si se salda hoy (TC BCRA {formatNumber(todayRate!.rate, 2)})</p>
                  <p className="tabular">Pesos para saldar: {formatMoney(settlement.arsToSettle, cur)}</p>
                  {settlement.note ? (
                    <p className="tabular">
                      {settlement.difference > 0 ? "Nota de débito" : "Nota de crédito"} por diferencia de cambio: <strong>{formatMoney(settlement.note.total, cur)}</strong>
                      {settlement.note.vat ? ` (IVA ${formatMoney(settlement.note.vat, cur)})` : ""}
                    </p>
                  ) : (
                    <p>Sin diferencia de cambio.</p>
                  )}
                </div>
                {settlement.usdPending > 0.01 && (pending ?? 0) > 0 ? (
                  <Button asChild className="w-full">
                    <Link href={`/app/comprobantes/nuevo?tipo=${meta.side === "venta" ? "recibo" : "orden_pago"}&party=${doc.party_id}&saldar=${doc.id}${cuentaQs}`}>
                      {meta.side === "venta" ? "Cobrar y saldar" : "Pagar y saldar"}
                    </Link>
                  </Button>
                ) : settlement.note && settlement.difference < 0 && (pending ?? 0) > 0 ? (
                  <form action={settleFxDifference}>
                    <input type="hidden" name="id" value={doc.id} />
                    <input type="hidden" name="rate" value={todayRate!.rate} />
                    <Button className="w-full">Emitir nota de crédito por {formatMoney(settlement.note.total, cur)}</Button>
                  </form>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Link2 className="size-5" aria-hidden /> Trazabilidad
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {source ? <RefList title="Origen" items={[{ ref: source }]} cur={cur} /> : null}
              {cancelledBy.length ? (
                <RefList
                  title={doc.type.startsWith("factura") || doc.type.startsWith("nota_debito") ? "Cancelado por" : "Aplicado por"}
                  items={cancelledBy.map((c) => ({ ref: c.payment, amount: Number(c.amount), currency: doc.currency, fx: Number(c.fx_rate) }))}
                  cur={cur}
                />
              ) : null}
              {cancels.length ? (
                <RefList title="Cancela" items={cancels.map((c) => ({ ref: c.invoice, amount: Number(c.amount), currency: c.invoice.currency, fx: Number(c.fx_rate) }))} cur={cur} />
              ) : null}
              {derived.length ? <RefList title="Comprobantes generados" items={derived.map((d) => ({ ref: d }))} cur={cur} /> : null}
              {!source && !cancelledBy.length && !cancels.length && !derived.length ? <p className="text-muted-foreground">Sin comprobantes vinculados.</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function RefList({ title, items, cur }: { title: string; items: { ref: Ref; amount?: number; currency?: string; fx?: number }[]; cur: string }) {
  return (
    <div>
      <p className="mb-1 font-semibold">{title}</p>
      <ul className="space-y-1">
        {items.map(({ ref, amount, currency, fx }) => (
          <li key={`${title}-${ref.id}`} className="flex justify-between gap-2">
            <Link href={`/app/comprobantes/${ref.id}`} className="text-primary hover:underline">
              {refLabel(ref)}
              {ref.ledger === "gestion" ? " (Gestión)" : ""}
              {ref.concept === "diferencia_cambio" ? " (dif. cambio)" : ref.concept === "cheque_rechazado" ? " (cheque rechazado)" : ""}
            </Link>
            <span className="text-right tabular text-muted-foreground">
              {amount != null ? formatMoney(amount, currency ?? cur) : formatMoney(Number(ref.total), ref.currency)}
              {fx && fx !== 1 ? ` @ ${formatNumber(fx, 2)}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Item({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular">{value}</dd>
    </div>
  );
}
