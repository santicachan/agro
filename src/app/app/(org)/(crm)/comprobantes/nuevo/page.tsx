import { DocumentForm } from "@/components/crm/document-form";
import { PaymentForm } from "@/components/crm/payment-form";
import { PageHeader } from "@/components/ui/misc";
import { requireCrm } from "@/lib/auth";
import { DOC_TYPES, documentLabel, type DocType } from "@/lib/crm/documents";
import { parseLedger } from "@/lib/crm/ledger";
import { associableDocuments, chequesInPortfolio, listParties, openItems } from "@/lib/crm/queries";
import { fetchFx } from "@/lib/prices/sources/fx";

export const metadata = { title: "Nuevo comprobante" };

export default async function NewDocumentPage({ searchParams }: { searchParams: Promise<{ tipo?: string; party?: string; origen?: string; cuenta?: string }> }) {
  const sp = await searchParams;
  const ledger = parseLedger(sp.cuenta);
  const gestion = ledger === "gestion";
  const type = (sp.tipo && sp.tipo in DOC_TYPES ? sp.tipo : "factura_venta") as DocType;
  const ctx = await requireCrm();
  const side = DOC_TYPES[type].side;
  const [parties, fx] = await Promise.all([listParties(ctx, side === "venta" ? "customer" : "supplier"), fetchFx()]);
  const pair = ctx.org.base_currency === "BRL" ? "USD/BRL" : "USD/ARS";
  // BNA divisa vendedor is the usual reference for invoicing in USD.
  const usdRate = fx.items.find((f) => f.pair === pair)?.sell ?? null;
  const partyOptions = parties.map((p) => ({ id: p.id, name: p.name }));

  if (type === "recibo" || type === "orden_pago") {
    const [items, portfolio] = await Promise.all([
      sp.party ? openItems(ctx, sp.party, side, ledger) : Promise.resolve([]),
      type === "orden_pago" ? chequesInPortfolio(ctx) : Promise.resolve([]),
    ]);
    return (
      <>
        <PageHeader
          title={`${type === "recibo" ? "Nuevo recibo (cobro)" : "Nueva orden de pago"}${gestion ? " · Gestión" : ""}`}
          description={gestion ? "Cuenta Gestión: operación interna, no va a los libros contables." : undefined}
        />
        <PaymentForm
          key={`${sp.party ?? "none"}-${ledger}`}
          ledger={ledger}
          type={type}
          parties={partyOptions}
          partyId={sp.party}
          openItems={items}
          portfolio={portfolio.map((c) => ({ ...c, amount: Number(c.amount) }))}
          baseCurrency={ctx.org.base_currency}
          usdRate={usdRate}
        />
      </>
    );
  }

  if (type === "canje") return null;
  const isNote = type.startsWith("nota_");
  const associable = isNote && sp.party ? await associableDocuments(ctx, sp.party, side, ledger) : [];
  const title = gestion
    ? type.startsWith("factura")
      ? `Nueva ${documentLabel(type, null, "gestion")} X`
      : `Nuevo: ${DOC_TYPES[type].label} X (Gestión)`
    : `Nuevo: ${DOC_TYPES[type].label}`;

  return (
    <>
      <PageHeader
        title={title}
        description={
          gestion
            ? "Cuenta Gestión: comprobante interno con letra X. No se envía a ARCA ni aparece en los libros contables."
            : DOC_TYPES[type].fiscal
              ? "La letra (A/B/C) se asigna automáticamente según la condición de IVA."
              : undefined
        }
      />
      <DocumentForm
        key={`${sp.party ?? ""}-${sp.origen ?? ""}-${ledger}`}
        ledger={ledger}
        type={type}
        parties={partyOptions}
        partyId={sp.party}
        baseCurrency={ctx.org.base_currency}
        vatRates={ctx.region.vatRates}
        usdRate={usdRate}
        associable={associable.map((a) => ({ ...a, fx_rate: Number(a.fx_rate), total: Number(a.total) }))}
        sourceId={sp.origen}
      />
    </>
  );
}
