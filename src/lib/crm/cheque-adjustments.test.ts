import { describe, expect, it } from "vitest";
import { chequeAdjustment, collectionDifference } from "./cheque-adjustments";

describe("cheque adjustments", () => {
  it("revalues the amount to the collection-day rate", () => {
    expect(collectionDifference(1_000_000, 1000, 1100)).toBe(100_000);
    expect(collectionDifference(1_000_000, 1000, 950)).toBe(-50_000);
    expect(collectionDifference(1_000_000, 0, 950)).toBe(0);
  });

  it("puts fees and a positive difference in one nota de débito", () => {
    const r = chequeAdjustment({ side: "venta", fee: 1000, feeVatRate: 21, base: 1_210_000, invoiceFx: 1000, collectionFx: 1100, diffVatRate: 21 });
    expect(r.difference).toBe(121_000);
    expect(r.notes).toHaveLength(1);
    expect(r.notes[0]).toMatchObject({ type: "nota_debito_venta", concept: "diferencia_cambio", net: 101_000, vat: 21_210, total: 122_210 });
  });

  it("issues a nota de crédito when the peso got stronger, and fees apart", () => {
    const r = chequeAdjustment({ side: "compra", fee: 500, feeVatRate: 0, base: 1_000_000, invoiceFx: 1000, collectionFx: 900, diffVatRate: 0 });
    expect(r.notes.map((n) => [n.type, n.concept, n.total])).toEqual([
      ["nota_debito_compra", "cheque_rechazado", 500],
      ["nota_credito_compra", "diferencia_cambio", 100_000],
    ]);
  });
});
