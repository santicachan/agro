/**
 * Demo data that walks the whole commercial flow, created through the same
 * payload builders and RPCs as the app, signed in as the demo user (RLS applies).
 *
 *   SUPABASE_URL=… SUPABASE_ANON_KEY=… SUPABASE_SCHEMA=agrojc \
 *   DEMO_EMAIL=… DEMO_PASSWORD=… npx tsx scripts/seed-demo.ts
 *
 * Refuses to run twice on the same organization.
 */
import { createClient } from "@supabase/supabase-js";
import { arcaPreflight, buildFECAERequest } from "../src/lib/crm/arca";
import { computeTotals } from "../src/lib/crm/documents";
import { buildDocumentRpc, buildPaymentRpc, type DocumentInput, type InvoiceForPayment, type OrgInfo, type PartyInfo, type PaymentInput } from "../src/lib/crm/payloads";

const env = (k: string) => {
  const v = process.env[k];
  if (!v) throw new Error(`Falta ${k}`);
  return v;
};

const sb = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), { db: { schema: process.env.SUPABASE_SCHEMA ?? "public" }, auth: { persistSession: false } });

const today = new Date();
const day = (offset: number) => new Date(today.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

async function must<T>(p: PromiseLike<{ data: T; error: { message: string } | null }>, what: string): Promise<NonNullable<T>> {
  const { data, error } = await p;
  if (error) throw new Error(`${what}: ${error.message}`);
  return data as NonNullable<T>;
}

async function main() {
  const { error: authError } = await sb.auth.signInWithPassword({ email: env("DEMO_EMAIL"), password: env("DEMO_PASSWORD") });
  if (authError) throw new Error(`Login: ${authError.message}`);

  const [m] = await must(sb.from("memberships").select("org_id, organizations(*)").limit(1), "membresía");
  const orgRow = (m as unknown as { organizations: OrgInfo & { name: string; plan_id: string } }).organizations;
  if (!orgRow) throw new Error("El usuario no tiene empresa");
  const exists = await must(sb.from("parties").select("id").eq("org_id", orgRow.id).eq("name", "Campo Sur SRL"), "verificación");
  if (exists.length) {
    console.log("Los datos de demo ya existen en esta empresa: no hago nada.");
    return;
  }

  // Company settings ready for ARCA (valid CUIT, RI, punto de venta 3).
  await must(
    sb.from("organizations").update({ name: "Agropecuaria Demo SA", tax_id: "30-71234567-1", tax_condition: "RI", arca_config: { pointOfSale: 3, environment: "homologacion" } }).eq("id", orgRow.id),
    "configuración",
  );
  const org: OrgInfo = { id: orgRow.id, base_currency: "ARS", tax_condition: "RI", arca_config: { pointOfSale: 3 } };

  const party = async (kind: "customer" | "supplier", name: string, tax_id: string, tax_condition: "RI" | "MONO", city: string): Promise<PartyInfo & { name: string }> => {
    const [p] = await must(sb.from("parties").insert({ org_id: org.id, kind, name, tax_id, tax_condition, city, province: "Santa Fe" }).select("id, tax_condition"), `alta ${name}`);
    return { ...(p as PartyInfo), name };
  };
  const doc = async (p: PartyInfo, d: DocumentInput) => (await must(sb.rpc("create_document", buildDocumentRpc(org, p, d)), `comprobante ${d.type}`)) as string;
  const invoiceInfo = async (id: string): Promise<InvoiceForPayment> => {
    const [r] = await must(sb.from("documents").select("id, type, letter, point_of_sale, number, currency, fx_rate, total, document_lines(vat_rate, net)").eq("id", id), "factura");
    const row = r as unknown as InvoiceForPayment & { document_lines: { vat_rate: number; net: number }[] };
    return { ...row, fx_rate: Number(row.fx_rate), total: Number(row.total), lines: row.document_lines.map((l) => ({ vat_rate: Number(l.vat_rate), net: Number(l.net) })) };
  };
  const pay = async (p: PartyInfo, input: PaymentInput, invoiceIds: string[]) =>
    (await must(sb.rpc("create_document", buildPaymentRpc(org, p, input, await Promise.all(invoiceIds.map(invoiceInfo)))), `pago ${input.type}`)) as string;

  // ── Parties
  const esperanza = await (async () => {
    const found = await must(sb.from("parties").select("id, tax_condition").eq("org_id", org.id).eq("name", "Estancia La Esperanza"), "cliente");
    if (found.length) {
      await must(sb.from("parties").update({ tax_id: "20-23456789-7", tax_condition: "RI" }).eq("id", found[0].id), "cliente");
      return { id: found[0].id as string, tax_condition: "RI" as const, name: "Estancia La Esperanza" };
    }
    return party("customer", "Estancia La Esperanza", "20-23456789-7", "RI", "Pergamino");
  })();
  const campoSur = await party("customer", "Campo Sur SRL", "30-70881234-6", "RI", "Venado Tuerto");
  const perez = await party("customer", "Juan Pérez", "20-12345678-6", "MONO", "Casilda");
  const agroinsumos = await party("supplier", "Agroinsumos del Litoral SA", "30-71555123-9", "RI", "Rosario");
  const transporte = await party("supplier", "Transportes Rafaela SA", "30-70444321-4", "RI", "Rafaela");

  // ── 1. Factura de venta en USD + remito → validada para ARCA
  const fvUsd = await doc(esperanza, {
    type: "factura_venta", issueDate: day(-1), currency: "USD", fxRate: 1450, dueDate: day(14),
    notes: "Venta de insumos campaña gruesa",
    lines: [
      { description: "Glifosato 66% — bidón 20 L", quantity: 20, unit: "u", unitPrice: 95, vatRate: 21 },
      { description: "Semilla de soja — bolsa 40 kg", quantity: 40, unit: "bolsa", unitPrice: 38, vatRate: 10.5 },
    ],
  });
  await doc(esperanza, {
    type: "remito", issueDate: day(-1), currency: "USD", fxRate: 1450, sourceDocumentId: fvUsd,
    lines: [
      { description: "Glifosato 66% — bidón 20 L", quantity: 20, unit: "u", unitPrice: 95, vatRate: 21 },
      { description: "Semilla de soja — bolsa 40 kg", quantity: 40, unit: "bolsa", unitPrice: 38, vatRate: 10.5 },
    ],
  });
  // Store the validated CAE request, exactly as "Autorizar en ARCA" does before the certificate is loaded.
  const inv = await invoiceInfo(fvUsd);
  const lines = inv.lines.map((l) => ({ description: "", quantity: 1, unitPrice: l.net, vatRate: l.vat_rate }));
  const totals = computeTotals(lines);
  const [full] = await must(sb.from("documents").select("number, issue_date, net, vat, other_taxes, total").eq("id", fvUsd), "factura");
  const errors = arcaPreflight({
    type: "factura_venta", letter: "A", pointOfSale: 3, issueDate: full.issue_date, issuerCuit: "30-71234567-1", receiverCuit: "20-23456789-7",
    receiverCondition: "RI", vatRates: totals.vatByRate.map((v) => v.rate), total: Number(full.total), configuredPointOfSale: 3,
  });
  if (errors.length) throw new Error(`Preflight ARCA: ${errors.join("; ")}`);
  const request = buildFECAERequest({
    type: "factura_venta", letter: "A", pointOfSale: 3, number: full.number, issueDate: full.issue_date, receiverTaxId: "20-23456789-7", currency: "USD", fxRate: 1450,
    net: Number(full.net), vat: Number(full.vat), otherTaxes: 0, total: Number(full.total), vatByRate: totals.vatByRate,
  });
  await must(sb.from("documents").update({ arca_response: { status: "ready", preparedAt: new Date().toISOString(), request } }).eq("id", fvUsd), "ARCA");

  // ── 2. Cobro en pesos a un TC mayor → recibo + ND por diferencia de cambio (automática)
  const usdTotal = inv.total;
  const cobrado = Math.round(usdTotal * 1510 * 100) / 100;
  await pay(esperanza, {
    type: "recibo", issueDate: day(0), fxRate: 1510, notes: "Cobro factura en dólares al TC del día",
    items: [
      { method: "transferencia", amount: Math.round((cobrado - 2_000_000) * 100) / 100, reference: "Transferencia Banco Santa Fe" },
      { method: "cheque", amount: 2_000_000, cheque: { bank: "Banco Nación", number: "48213377", drawerName: "Estancia La Esperanza", paymentDate: day(10) } },
    ],
    applications: [{ invoiceId: fvUsd, amount: usdTotal }],
  }, [fvUsd]);
  const [chNacion] = await must(sb.from("cheques").select("id").eq("org_id", org.id).eq("number", "48213377"), "cheque");
  await must(sb.from("cheques").update({ status: "depositado", deposited_at: day(0) }).eq("id", chNacion.id), "depósito");

  // ── 3. Factura de servicio, cobro con cheque que rebota → ND automática con gastos
  const fvServ = await doc(campoSur, {
    type: "factura_venta", issueDate: day(-10), currency: "ARS", fxRate: 1, dueDate: day(5),
    lines: [{ description: "Servicio de pulverización terrestre", quantity: 300, unit: "ha", unitPrice: 9500, vatRate: 21 }],
  });
  await pay(campoSur, {
    type: "recibo", issueDate: day(-7), fxRate: 1,
    items: [{ method: "cheque", amount: 2_000_000, cheque: { bank: "Banco Galicia", number: "00917762", drawerName: "Campo Sur SRL", paymentDate: day(-4) } }],
    applications: [{ invoiceId: fvServ, amount: 2_000_000 }],
  }, [fvServ]);
  const [chGalicia] = await must(sb.from("cheques").select("id").eq("org_id", org.id).eq("number", "00917762"), "cheque");
  await must(sb.from("cheques").update({ status: "depositado", deposited_at: day(-4) }).eq("id", chGalicia.id), "depósito");
  await must(sb.rpc("reject_cheque", { p_cheque: chGalicia.id, p_fee: 8500, p_fee_vat_rate: 21, p_reason: "Sin fondos suficientes", p_date: day(-2) }), "rechazo");

  // ── 4. Factura B a monotributista + nota de crédito por bonificación
  const fvB = await doc(perez, {
    type: "factura_venta", issueDate: day(-8), currency: "ARS", fxRate: 1,
    lines: [{ description: "Fertilizante MAP — bolsa 50 kg", quantity: 30, unit: "bolsa", unitPrice: 42000, vatRate: 21 }],
  });
  await doc(perez, {
    type: "nota_credito_venta", issueDate: day(-6), currency: "ARS", fxRate: 1, sourceDocumentId: fvB, applyToSource: 152460,
    notes: "Bonificación por pago anticipado", lines: [{ description: "Bonificación 10% por pago anticipado", quantity: 1, unitPrice: 126000, vatRate: 21 }],
  });
  await pay(perez, {
    type: "recibo", issueDate: day(-5), fxRate: 1,
    items: [{ method: "cheque", amount: 1_372_140, cheque: { bank: "Banco Macro", number: "33004512", drawerName: "Juan Pérez", paymentDate: day(20) } }],
    applications: [{ invoiceId: fvB, amount: 1_372_140 }],
  }, [fvB]);

  // ── 5. Factura de compra → orden de pago con cheque endosado + transferencia
  const fcInsumos = await doc(agroinsumos, {
    type: "factura_compra", issueDate: day(-9), currency: "ARS", fxRate: 1, pointOfSale: 12, number: 4581,
    lines: [{ description: "Urea granulada — t", quantity: 3, unit: "t", unitPrice: 850000, vatRate: 21 }],
  });
  const [chMacro] = await must(sb.from("cheques").select("id, amount").eq("org_id", org.id).eq("number", "33004512"), "cheque");
  const fcTotal = Math.round(3 * 850000 * 1.21 * 100) / 100;
  await pay(agroinsumos, {
    type: "orden_pago", issueDate: day(-3), fxRate: 1,
    items: [
      { method: "cheque", amount: Number(chMacro.amount), chequeId: chMacro.id },
      { method: "transferencia", amount: Math.round((fcTotal - Number(chMacro.amount)) * 100) / 100, reference: "Transferencia Banco Santa Fe" },
    ],
    applications: [{ invoiceId: fcInsumos, amount: fcTotal }],
  }, [fcInsumos]);

  // ── 6. Compra en USD pagada a otro TC → ND del proveedor por diferencia de cambio
  const fcUsd = await doc(agroinsumos, {
    type: "factura_compra", issueDate: day(-12), currency: "USD", fxRate: 1440, pointOfSale: 12, number: 4502,
    lines: [{ description: "Fungicida — bidón 5 L", quantity: 60, unit: "u", unitPrice: 48, vatRate: 21 }],
  });
  const fcUsdInfo = await invoiceInfo(fcUsd);
  await pay(agroinsumos, {
    type: "orden_pago", issueDate: day(-1), fxRate: 1505,
    items: [{ method: "transferencia", amount: Math.round(fcUsdInfo.total * 1505 * 100) / 100, reference: "Transferencia en pesos al TC del día" }],
    applications: [{ invoiceId: fcUsd, amount: fcUsdInfo.total }],
  }, [fcUsd]);

  // ── 7. Flete pendiente de pago
  await doc(transporte, {
    type: "factura_compra", issueDate: day(-4), currency: "ARS", fxRate: 1, pointOfSale: 2, number: 18734, dueDate: day(26),
    lines: [{ description: "Flete de granos Venado Tuerto – Rosario", quantity: 90, unit: "t", unitPrice: 28000, vatRate: 21 }],
  });

  console.log("Datos de demo cargados en", orgRow.name);
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
