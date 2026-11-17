import { describe, expect, it } from "vitest";
import { computeTotals, exchangeDifference, formatDocNumber, invoiceLetter, ledgerSign, runningBalance, swapTons } from "./documents";
import { buildFECAERequest } from "./arca";
import { PLANS, commission, friendlyDbError, getPlan, usagePct } from "@/lib/billing/plans";

describe("documents", () => {
  it("picks invoice letter", () => {
    expect(invoiceLetter("RI", "RI")).toBe("A");
    expect(invoiceLetter("RI", "CF")).toBe("B");
    expect(invoiceLetter("RI", "MONO")).toBe("B");
    expect(invoiceLetter("MONO", "RI")).toBe("C");
  });
  it("formats numbers", () => {
    expect(formatDocNumber(1, 12)).toBe("00001-00000012");
  });
  it("computes totals grouped by VAT rate", () => {
    const t = computeTotals([
      { description: "Glifosato", quantity: 20, unitPrice: 4.5, vatRate: 21 },
      { description: "Semilla", quantity: 10, unitPrice: 50, vatRate: 10.5 },
      { description: "Flete", quantity: 1, unitPrice: 100, vatRate: 21 },
    ]);
    expect(t.net).toBe(690);
    expect(t.vat).toBe(39.9 + 52.5);
    expect(t.total).toBe(782.4);
    expect(t.vatByRate).toEqual([
      { rate: 10.5, base: 500, amount: 52.5 },
      { rate: 21, base: 190, amount: 39.9 },
    ]);
  });
  it("ledger signs balance a sale cycle to zero", () => {
    const moves = [
      { amount: 1000 * ledgerSign("factura_venta") },
      { amount: 600 * ledgerSign("recibo") },
      { amount: 400 * ledgerSign("recibo") },
    ];
    expect(runningBalance(moves).map((m) => m.balance)).toEqual([1000, 400, 0]);
    expect(ledgerSign("remito")).toBe(0);
  });
});

describe("exchange difference", () => {
  it("issues ND when the peso devalues", () => {
    // USD 1210 invoice (1000 net + 210 VAT) at 1500, paid at 1550.
    const r = exchangeDifference({ foreignTotal: 1210, foreignVat: 210, invoiceFx: 1500, paymentFx: 1550 });
    expect(r.type).toBe("nota_debito_venta");
    expect(r.total).toBe(60500);
    expect(r.net).toBe(50000);
    expect(r.vat).toBe(10500);
    expect(r.vatRate).toBe(21);
  });
  it("issues NC when the rate goes down and handles partial payments", () => {
    const r = exchangeDifference({ foreignTotal: 1210, foreignVat: 210, invoiceFx: 1500, paymentFx: 1480, appliedFraction: 0.5 });
    expect(r.type).toBe("nota_credito_venta");
    expect(r.total).toBe(12100);
  });
});

describe("canje", () => {
  it("computes tons to cancel a debt", () => {
    expect(swapTons(34000, 340)).toBe(100);
    expect(swapTons(34000, 340, -5)).toBeCloseTo(105.264, 3);
  });
});

describe("ARCA request", () => {
  it("builds a factura A in pesos", () => {
    const req = buildFECAERequest({
      type: "factura_venta",
      letter: "A",
      pointOfSale: 3,
      number: 15,
      issueDate: "2026-11-16",
      receiverTaxId: "30-71234567-9",
      currency: "ARS",
      fxRate: 1,
      net: 1000,
      vat: 210,
      otherTaxes: 0,
      total: 1210,
      vatByRate: [{ rate: 21, base: 1000, amount: 210 }],
    });
    expect(req.FeCAEReq.FeCabReq).toEqual({ CantReg: 1, PtoVta: 3, CbteTipo: 1 });
    const det = req.FeCAEReq.FeDetReq.FECAEDetRequest[0] as Record<string, unknown>;
    expect(det.DocTipo).toBe(80);
    expect(det.DocNro).toBe(30712345679);
    expect(det.CbteFch).toBe("20261116");
    expect(det.Iva).toEqual({ AlicIva: [{ Id: 5, BaseImp: 1000, Importe: 210 }] });
  });
  it("factura C has no VAT detail", () => {
    const req = buildFECAERequest({
      type: "factura_venta", letter: "C", pointOfSale: 1, number: 1, issueDate: "2026-11-16", receiverTaxId: null,
      currency: "USD", fxRate: 1550, net: 100, vat: 0, otherTaxes: 0, total: 100, vatByRate: [],
    });
    const det = req.FeCAEReq.FeDetReq.FECAEDetRequest[0] as Record<string, unknown>;
    expect(det.Iva).toBeUndefined();
    expect(det.MonId).toBe("DOL");
    expect(det.DocTipo).toBe(99);
    expect(req.FeCAEReq.FeCabReq.CbteTipo).toBe(11);
  });
  it("rejects non-fiscal documents", () => {
    expect(() => buildFECAERequest({ type: "remito" } as never)).toThrow();
  });
});

describe("plans", () => {
  it("usage and commission", () => {
    expect(usagePct(10, 20)).toBe(50);
    expect(usagePct(10, null)).toBeNull();
    expect(commission(1000, "pro")).toEqual({ pct: 4, amount: 40 });
  });
  it("CRM is only for paid plans", () => {
    expect(PLANS.filter((p) => !p.crm).map((p) => p.id)).toEqual(["free"]);
    expect(getPlan("free").maxListings).toBe(1);
  });
  it("friendly errors", () => {
    expect(friendlyDbError("PLAN_LIMIT: tu plan Gratis permite hasta 25 clientes")).toContain("Pasate a un plan superior");
  });
});
