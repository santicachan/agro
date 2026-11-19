import { describe, expect, it } from "vitest";
import { ledgerLetter, marmolada, movementAmountIn, parseLedgerView, parseViewCurrency, rateOn } from "./ledger";

describe("ledger helpers", () => {
  it("parses views and currencies defensively", () => {
    expect(parseLedgerView("gestion")).toBe("gestion");
    expect(parseLedgerView("marmolada")).toBe("marmolada");
    expect(parseLedgerView("x")).toBe("blanco");
    expect(parseViewCurrency("USD")).toBe("USD");
    expect(parseViewCurrency(undefined)).toBe("ARS");
  });

  it("uses letter X for gestión invoices", () => {
    expect(ledgerLetter("gestion", "A")).toBe("X");
    expect(ledgerLetter("gestion", null)).toBeNull();
    expect(ledgerLetter("blanco", "B")).toBe("B");
  });

  it("finds the rate of a day", () => {
    const h = [
      { date: "2026-11-17", rate: 1543 },
      { date: "2026-11-18", rate: 1550.5 },
    ];
    expect(rateOn(h, "2026-11-18", 1)).toBe(1550.5);
    expect(rateOn(h, "2026-11-20", 1)).toBe(1550.5);
    expect(rateOn(h, "2026-01-01", 1)).toBe(1543);
    expect(rateOn([], "2026-01-01", 1600)).toBe(1600);
  });

  it("converts movements to USD", () => {
    const peso = { type: "factura_venta" as const, issue_date: "2026-11-17", currency: "ARS", fx_rate: 1, total: 1543000, amount: 1543000 };
    expect(movementAmountIn(peso, "ARS", "ARS", () => 1000)).toBe(1543000);
    expect(movementAmountIn(peso, "USD", "ARS", () => 1543)).toBe(1000);
    expect(movementAmountIn({ ...peso, usd_rate: 1000 }, "USD", "ARS", () => 1543)).toBe(1543);
    const usd = { type: "recibo" as const, issue_date: "2026-11-17", currency: "USD", fx_rate: 1500, total: 200, amount: -300000 };
    expect(movementAmountIn(usd, "USD", "ARS", () => 1)).toBe(-200);
    expect(movementAmountIn(peso, "USD", "ARS", () => null)).toBeNull();
  });

  it("marmolada only lists parties with both ledgers, without mixing them", () => {
    const rows = marmolada([
      { party_id: "a", ledger: "blanco", amount: 100 },
      { party_id: "a", ledger: "gestion", amount: 40 },
      { party_id: "a", ledger: "gestion", amount: -10 },
      { party_id: "b", ledger: "blanco", amount: 50 },
      { party_id: "c", ledger: "gestion", amount: 5 },
    ]);
    expect(rows).toEqual([{ partyId: "a", blanco: 100, gestion: 30, combined: 130, difference: 70 }]);
  });
});
