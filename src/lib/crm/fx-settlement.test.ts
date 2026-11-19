import { describe, expect, it } from "vitest";
import { fxSettlement, splitByVat, usdCancelled } from "./fx-settlement";

const bases = [{ rate: 21, base: 1_000_000 }, { rate: 10.5, base: 500_000 }];
const total = 1_000_000 * 1.21 + 500_000 * 1.105; // 1.762.500

describe("liquidación de diferencia de cambio", () => {
  it("ND when the peso weakened", () => {
    const s = fxSettlement({ side: "venta", totalArs: total, pendingArs: total, invoiceRate: 1500, usdPaid: 0, paymentRate: 1550, vatBases: bases })!;
    expect(s.usdValue).toBe(1175);
    expect(s.arsToSettle).toBe(1_821_250);
    expect(s.difference).toBe(58_750);
    expect(s.note).toMatchObject({ type: "nota_debito_venta", total: 58_750 });
  });

  it("NC when the peso got stronger, after a partial payment", () => {
    // USD 500 paid earlier at 1600 = $800.000; the rest at 1450.
    const usdPaid = usdCancelled([{ amount: 800_000, paymentRate: 1600 }], 1500);
    expect(usdPaid).toBe(500);
    const s = fxSettlement({ side: "compra", totalArs: total, pendingArs: total - 800_000, invoiceRate: 1500, usdPaid, paymentRate: 1450, vatBases: bases })!;
    expect(s.usdPending).toBe(675);
    expect(s.arsToSettle).toBe(978_750);
    expect(s.difference).toBe(16_250);
    expect(s.note?.type).toBe("nota_debito_compra");
  });

  it("no note without difference", () => {
    const s = fxSettlement({ side: "venta", totalArs: 121_000, pendingArs: 121_000, invoiceRate: 1000, usdPaid: 0, paymentRate: 1000, vatBases: [{ rate: 21, base: 100_000 }] })!;
    expect(s.note).toBeNull();
  });

  it("splits by VAT keeping the exact total", () => {
    const lines = splitByVat(100, bases);
    expect(lines.reduce((s, l) => s + l.net + l.vat, 0)).toBeCloseTo(100, 2);
  });
});
