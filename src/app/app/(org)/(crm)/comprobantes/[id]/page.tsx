import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, Badge, PageHeader, Table, Td, Th } from "@/components/ui/misc";
import { PrintButton } from "@/components/crm/print-button";
import { requireCrm } from "@/lib/auth";
import { authorizeWithArca, invoiceFromRemito } from "@/lib/crm/actions";
import { DOC_TYPES, TAX_CONDITIONS, formatDocNumber, type DocType } from "@/lib/crm/documents";
import type { DocumentRow } from "@/lib/crm/queries";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";

export const metadata = { title: "Comprobante" };

export default async function DocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const [{ id }, { error }] = await Promise.all([params, searchParams]);
  const ctx = await requireCrm();
  const { data } = await ctx.supabase
    .from("documents")
    .select("*, parties(name, tax_id, tax_condition), document_lines(*), payment_items(*, cheques(bank, number, payment_date)), applications!applications_payment_document_id_fkey(amount, fx_rate, documents!applications_invoice_document_id_fkey(id, type, letter, point_of_sale, number, currency))")
    .eq("id", id)
    .eq("org_id", ctx.org.id)
    .maybeSingle();
  if (!data) notFound();
  const doc = data as DocumentRow & {
    document_lines: { id: string; description: string; quantity: number; unit: string; unit_price: number; vat_rate: number; net: number }[];
    payment_items: { id: string; method: string; amount: number; reference: string | null; cheques: { bank: string; number: string; payment_date: string } | null }[];
    applications: { amount: number; fx_rate: number; documents: { id: string; type: DocType; letter: string | null; point_of_sale: number; number: number; currency: string } }[];
  };
  const { data: derived } = await ctx.supabase.from("documents").select("id, type, letter, point_of_sale, number").eq("source_document_id", id).eq("org_id", ctx.org.id);
  const meta = DOC_TYPES[doc.type];
  const canAuthorize = meta.fiscal && doc.status === "issued" && ["owner", "admin"].includes(ctx.role);
  const alreadyInvoiced = derived?.some((d) => d.type === "factura_venta");

  return (
    <>
      <PageHeader
        title={`${meta.label} ${doc.letter ?? ""} ${formatDocNumber(doc.point_of_sale, doc.number)}`}
        description={`${formatDate(`${doc.issue_date}T12:00:00`)} · ${doc.parties?.name ?? ""}`}
        actions={<PrintButton />}
      />
      {error ? (
        <Alert tone="error" className="mb-4">
          {error}
        </Alert>
      ) : null}

      <div className="mb-4 flex flex-wrap gap-2 print:hidden">
        {doc.type === "remito" && !alreadyInvoiced ? (
          <form action={invoiceFromRemito.bind(null, doc.id)}>
            <Button size="lg">Facturar este remito</Button>
          </form>
        ) : null}
        {canAuthorize ? (
          <form action={authorizeWithArca.bind(null, doc.id)}>
            <Button size="lg" variant="accent">
              Autorizar en ARCA (CAE)
            </Button>
          </form>
        ) : null}
        {meta.fiscal || doc.type === "factura_compra" ? (
          <Button asChild variant="secondary" size="lg">
            <Link href={`/app/comprobantes/nuevo?tipo=${meta.side === "venta" ? "recibo" : "orden_pago"}&party=${doc.party_id}`}>
              {meta.side === "venta" ? "Cobrar" : "Pagar"}
            </Link>
          </Button>
        ) : null}
      </div>

      <Card>
        <CardHeader className="flex-row flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{ctx.org.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {ctx.region.taxIdLabel} {ctx.org.tax_id ?? "—"} · {ctx.org.tax_condition ? TAX_CONDITIONS[ctx.org.tax_condition] : ""}
            </p>
          </div>
          <div className="text-right text-sm">
            {doc.status === "authorized" ? (
              <Badge variant="success">
                CAE {doc.cae} · vto {doc.cae_due}
              </Badge>
            ) : meta.fiscal ? (
              <Badge variant="accent">Pendiente de CAE</Badge>
            ) : null}
            <p className="mt-2 font-semibold">{doc.parties?.name}</p>
            <p className="text-muted-foreground">
              {doc.parties?.tax_id ?? ""} {doc.parties?.tax_condition ? `· ${TAX_CONDITIONS[doc.parties.tax_condition]}` : ""}
            </p>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
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
                    <span className="capitalize">
                      {p.method}
                      {p.cheques ? ` — ${p.cheques.bank} #${p.cheques.number}, vence ${formatDate(`${p.cheques.payment_date}T12:00:00`)}` : ""}
                      {p.reference ? ` — ${p.reference}` : ""}
                    </span>
                    <span className="tabular">{formatMoney(Number(p.amount), doc.currency)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {doc.applications?.length ? (
            <div>
              <h3 className="mb-2 font-semibold">Cancela</h3>
              <ul className="space-y-1 text-sm">
                {doc.applications.map((a) => (
                  <li key={a.documents.id} className="flex justify-between gap-3 border-b py-2">
                    <Link href={`/app/comprobantes/${a.documents.id}`} className="hover:underline">
                      {DOC_TYPES[a.documents.type].short} {a.documents.letter} {formatDocNumber(a.documents.point_of_sale, a.documents.number)}
                    </Link>
                    <span className="tabular">
                      {formatMoney(Number(a.amount), a.documents.currency)}
                      {Number(a.fx_rate) !== 1 ? ` @ ${a.fx_rate}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="ml-auto max-w-xs space-y-1 text-sm tabular">
            {meta.payment ? null : (
              <>
                <Row label="Neto gravado" value={formatMoney(Number(doc.net), doc.currency)} />
                <Row label="IVA" value={formatMoney(Number(doc.vat), doc.currency)} />
                {Number(doc.other_taxes) ? <Row label="Otros tributos" value={formatMoney(Number(doc.other_taxes), doc.currency)} /> : null}
              </>
            )}
            <div className="flex justify-between border-t pt-2 text-lg font-bold">
              <span>Total</span>
              <span>{formatMoney(Number(doc.total), doc.currency)}</span>
            </div>
            {doc.currency !== ctx.org.base_currency ? (
              <p className="text-right text-xs text-muted-foreground">
                TC {doc.fx_rate} = {formatMoney(Number(doc.total) * Number(doc.fx_rate), ctx.org.base_currency)}
              </p>
            ) : null}
          </div>
          {doc.notes ? <p className="text-sm text-muted-foreground">{doc.notes}</p> : null}
          {derived?.length ? (
            <p className="text-sm">
              Comprobantes relacionados:{" "}
              {derived.map((d) => (
                <Link key={d.id} href={`/app/comprobantes/${d.id}`} className="mr-2 font-medium text-primary hover:underline">
                  {DOC_TYPES[d.type as DocType].short} {d.letter} {formatDocNumber(d.point_of_sale, d.number)}
                </Link>
              ))}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </>
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
