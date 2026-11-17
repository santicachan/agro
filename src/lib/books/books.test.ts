import { describe, expect, it } from "vitest";
import { buildBook, periodRange, type BookDocument } from "./books";
import { exchangeDifferenceByRate } from "@/lib/crm/documents";
import { buildPaymentRpc } from "@/lib/crm/payloads";

const party = { name: "Estancia La Esperanza", tax_id: "20-12345678-6", tax_condition: "RI" as const };
const base = { status: "issued", cae: null, cae_due: null, concept: null, meta: {}, notes: null, source_document_id: null, other_taxes: 0, party };

const factUsd: BookDocument = {
  ...base, id: "f1", type: "factura_venta", letter: "A", point_of_sale: 1, number: 1, issue_date: "2026-11-02",
  currency: "USD", fx_rate: 1500, net: 1500, vat: 262.5, total: 1762.5,
  lines: [{ vat_rate: 21, net: 1000, vat: 210 }, { vat_rate: 10.5, net: 500, vat: 52.5 }],
};
const nc: BookDocument = {
  ...base, id: "n1", type: "nota_credito_venta", letter: "A", point_of_sale: 1, number: 1, issue_date: "2026-11-05",
  currency: "ARS", fx_rate: 1, net: 10000, vat: 2100, total: 12100, source_document_id: "f1",
  lines: [{ vat_rate: 21, net: 10000, vat: 2100 }],
};
const nd: BookDocument = {
  ...base, id: "d1", type: "nota_debito_venta", letter: "A", point_of_sale: 1, number: 1, issue_date: "2026-11-20",
  currency: "ARS", fx_rate: 1, net: 75000, vat: 13125, total: 88125, source_document_id: "f1", concept: "diferencia_cambio",
  meta: { invoiceFx: 1500, paymentFx: 1550, appliedForeign: 1762.5, invoiceCurrency: "USD" },
  lines: [{ vat_rate: 21, net: 50000, vat: 10500 }, { vat_rate: 10.5, net: 25000, vat: 2625 }],
};
const compra: BookDocument = {
  ...base, id: "c1", type: "factura_compra", letter: "A", point_of_sale: 3, number: 77, issue_date: "2026-11-10",
  currency: "ARS", fx_rate: 1, net: 400000, vat: 84000, total: 484000, party: { name: "Agroinsumos SRL", tax_id: "30-1", tax_condition: "RI" },
  lines: [{ vat_rate: 21, net: 400000, vat: 84000 }],
};
const docs = [factUsd, nc, nd, compra];
const opts = { orgName: "Agro Demo", currency: "ARS", period: "Noviembre 2026" };

describe("exchange difference by rate", () => {
  it("splits the difference per VAT rate and matches the total-based formula", () => {
    const r = exchangeDifferenceByRate({ side: "venta", vatBases: [{ rate: 21, base: 1000 }, { rate: 10.5, base: 500 }], foreignTotal: 1762.5, appliedForeign: 1762.5, invoiceFx: 1500, paymentFx: 1550 });
    expect(r.type).toBe("nota_debito_venta");
    expect(r.lines).toEqual([{ rate: 21, net: 50000, vat: 10500 }, { rate: 10.5, net: 25000, vat: 2625 }]);
    expect(r.total).toBe(1762.5 * 50);
  });
  it("credit note for purchases when the rate goes down, partial payment", () => {
    const r = exchangeDifferenceByRate({ side: "compra", vatBases: [{ rate: 21, base: 1000 }], foreignTotal: 1210, appliedForeign: 605, invoiceFx: 1500, paymentFx: 1480 });
    expect(r.type).toBe("nota_credito_compra");
    expect(r.total).toBe(605 * 20);
  });
});

describe("payment payload", () => {
  it("adds an applied ND per VAT rate so the invoice ends fully paid", () => {
    const rpc = buildPaymentRpc(
      { id: "o", base_currency: "ARS", tax_condition: "RI" },
      { id: "p", tax_condition: "RI" },
      { type: "recibo", issueDate: "2026-11-20", fxRate: 1550, items: [{ method: "transferencia", amount: 1762.5 * 1550 }], applications: [{ invoiceId: "f1", amount: 1762.5 }] },
      [{ id: "f1", type: "factura_venta", letter: "A", point_of_sale: 1, number: 1, currency: "USD", fx_rate: 1500, total: 1762.5, lines: factUsd.lines }],
    );
    expect(rpc.p_applications).toEqual([{ invoice_document_id: "f1", amount: 1762.5, fx_rate: 1550 }]);
    const note = rpc.p_fx_notes[0] as { doc: { type: string; total: number; letter: string; concept: string }; lines: unknown[] };
    expect(note.doc).toMatchObject({ type: "nota_debito_venta", total: 88125, letter: "A", concept: "diferencia_cambio" });
    expect(note.lines).toHaveLength(2);
    // Invoice in pesos at issue + ND = what the customer paid.
    expect(1762.5 * 1500 + note.doc.total).toBe(rpc.p_doc.total);
  });
});

describe("books", () => {
  it("IVA ventas: converts USD at the invoice rate, credit notes subtract", () => {
    const b = buildBook("iva-ventas", docs, opts);
    expect(b.rows).toHaveLength(3);
    expect(b.rows[0]).toMatchObject({ comprobante: "FC A 00001-00000001", neto_21: 1500000, iva_21: 315000, "neto_10.5": 750000, "iva_10.5": 78750, total: 2643750 });
    expect(b.rows[1]).toMatchObject({ neto_21: -10000, iva_21: -2100, total: -12100 });
    expect(b.totals).toMatchObject({ iva_21: 315000 - 2100 + 10500, total: 2643750 - 12100 + 88125 });
  });
  it("IVA compras only has purchases", () => {
    const b = buildBook("iva-compras", docs, opts);
    expect(b.rows.map((r) => r.comprobante)).toEqual(["FC-C A 00003-00000077"]);
  });
  it("alícuotas: débito − crédito fiscal", () => {
    const b = buildBook("alicuotas", docs, opts);
    const r21 = b.rows.find((r) => r.alicuota === "21%")!;
    expect(r21.debito).toBe(323400);
    expect(r21.credito).toBe(84000);
    expect(r21.saldo).toBe(239400);
    expect(b.totals!.saldo).toBe(323400 + 81375 - 84000);
  });
  it("diferencias de cambio carries both exchange rates and the original invoice", () => {
    const b = buildBook("diferencias-cambio", docs, opts);
    expect(b.rows).toEqual([expect.objectContaining({ factura: "FC A 00001-00000001", tc_factura: 1500, tc_pago: 1550, total: 88125 })]);
  });
  it("notas lists NC and ND with their association", () => {
    const b = buildBook("notas", docs, opts);
    expect(b.rows.map((r) => [r.tipo, r.asociado, r.total])).toEqual([
      ["Nota de crédito", "FC A 00001-00000001", -12100],
      ["Nota de débito", "FC A 00001-00000001", 88125],
    ]);
  });
  it("factura C informs the whole amount as exento", () => {
    const c = { ...compra, id: "c2", letter: "C", net: 1000, vat: 0, total: 1000, lines: [{ vat_rate: 0, net: 1000, vat: 0 }] };
    expect(buildBook("iva-compras", [c], opts).rows[0]).toMatchObject({ exento: 1000, neto_21: 0, total: 1000 });
  });
  it("period range", () => {
    expect(periodRange(2026, 2)).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(periodRange(2026, null)).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });
});
