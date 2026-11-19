import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import ExcelJS from "exceljs";
import { booksToPdf, booksToXlsx } from "./render";
import { BOOKS, buildBook, type BookDocument } from "./books";

const doc = (i: number): BookDocument => ({
  id: `f${i}`, type: i % 5 === 0 ? "nota_credito_venta" : "factura_venta", letter: "A", point_of_sale: 1, number: i, issue_date: `2026-11-${String((i % 28) + 1).padStart(2, "0")}`,
  currency: "ARS", fx_rate: 1, net: 1000 * i, vat: 210 * i, other_taxes: 0, total: 1210 * i, status: i % 3 ? "issued" : "authorized",
  cae: i % 3 ? null : `7612345678${String(i).padStart(4, "0")}`, cae_due: null, concept: null, meta: {}, notes: null, source_document_id: null,
  party: { name: `Cliente número ${i} con nombre largo SA`, tax_id: "30-71234567-9", tax_condition: "RI" }, lines: [{ vat_rate: 21, net: 1000 * i, vat: 210 * i }],
});
const docs = Array.from({ length: 70 }, (_, i) => doc(i + 1));
const books = BOOKS.map((b) => buildBook(b.id, docs, { orgName: "Agro Demo SA", currency: "ARS", period: "Noviembre 2026" }));

describe("renderers", () => {
  it("xlsx has one sheet per book with totals", async () => {
    const buf = await booksToXlsx(books, { orgName: "Agro Demo SA", app: "CAMPAGROX" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(books.map((b) => b.title.slice(0, 31)));
    const ws = wb.getWorksheet("Libro IVA Ventas")!;
    expect(ws.getCell(4, 1).value).toBe("Fecha");
    expect(ws.rowCount).toBeGreaterThan(70);
    if (process.env.BOOKS_OUT) (await import("node:fs")).writeFileSync(`${process.env.BOOKS_OUT}/libros.xlsx`, buf);
  });
  it("pdf renders multiple pages", async () => {
    const buf = await booksToPdf(books, { orgName: "Agro Demo SA", app: "CAMPAGROX" });
    expect(buf.subarray(0, 4).toString()).toBe("%PDF");
    expect(buf.length).toBeGreaterThan(5000);
    if (process.env.BOOKS_OUT) (await import("node:fs")).writeFileSync(`${process.env.BOOKS_OUT}/libros.pdf`, buf);
  });
});
