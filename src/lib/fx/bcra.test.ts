import { describe, expect, it } from "vitest";
import { parseCotizaciones, parseMonetarias, pickRate } from "./bcra";

describe("BCRA", () => {
  it("parses Com. A 3500 and picks the last business day", () => {
    const rows = parseMonetarias({ results: [{ idVariable: 5, detalle: [{ fecha: "2026-11-18", valor: 1558.2427 }, { fecha: "2026-11-13", valor: 1547.0336 }] }] });
    expect(pickRate(rows, "2026-11-15")).toEqual({ date: "2026-11-13", rate: 1547.0336 });
    expect(pickRate(rows, "2026-11-19")).toEqual({ date: "2026-11-18", rate: 1558.2427 });
    expect(pickRate(rows, "2026-11-01")).toBeNull();
  });
  it("parses the cotizaciones fallback", () => {
    expect(parseCotizaciones({ results: [{ fecha: "2026-11-18", detalle: [{ codigoMoneda: "USD", tipoCotizacion: 1559.5 }] }] })).toEqual([{ date: "2026-11-18", rate: 1559.5 }]);
  });
});
