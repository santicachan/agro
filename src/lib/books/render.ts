import "server-only";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import type { Book, Column, Row } from "./books";

const BRAND = "2F6B2F";

function fmtDate(v: unknown) {
  const s = String(v ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : s;
}

function fmtCell(c: Column, v: Row[string], blankZero = false) {
  if (v == null || v === "") return "";
  if (blankZero && c.type === "money" && Number(v) === 0) return "";
  if (c.type === "money") return Number(v).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (c.type === "number") return Number(v).toLocaleString("es-AR", { maximumFractionDigits: 4 });
  if (c.type === "date") return fmtDate(v);
  return String(v);
}

/** One workbook, one sheet per book, ready to send to the accountant. */
export async function booksToXlsx(books: Book[], meta: { orgName: string; app: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.app;
  wb.created = new Date();
  for (const book of books) {
    const ws = wb.addWorksheet(book.title.slice(0, 31), { views: [{ state: "frozen", ySplit: 4 }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1 } });
    ws.mergeCells(1, 1, 1, Math.max(4, book.columns.length));
    ws.getCell(1, 1).value = book.title;
    ws.getCell(1, 1).font = { bold: true, size: 14, color: { argb: `FF${BRAND}` } };
    ws.mergeCells(2, 1, 2, Math.max(4, book.columns.length));
    ws.getCell(2, 1).value = book.subtitle;
    ws.getCell(2, 1).font = { color: { argb: "FF5F6656" } };

    const header = ws.getRow(4);
    book.columns.forEach((c, i) => {
      const cell = header.getCell(i + 1);
      cell.value = c.label;
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${BRAND}` } };
      cell.alignment = { vertical: "middle", horizontal: c.type === "money" || c.type === "number" ? "right" : "left", wrapText: true };
      ws.getColumn(i + 1).width = c.width ?? (c.type === "money" ? 15 : 14);
    });
    header.height = 30;

    const write = (r: Row, bold = false) => {
      const row = ws.addRow(
        book.columns.map((c) => {
          const v = r[c.key];
          if (v == null || v === "") return null;
          if (c.type === "money" || c.type === "number") return Number(v);
          if (c.type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(String(v))) {
            const [y, m, d] = String(v).split("-").map(Number);
            return new Date(Date.UTC(y, m - 1, d));
          }
          return String(v);
        }),
      );
      book.columns.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        if (c.type === "money") cell.numFmt = "#,##0.00;[Red]-#,##0.00";
        if (c.type === "number") cell.numFmt = "#,##0.####";
        if (c.type === "date") cell.numFmt = "dd/mm/yyyy";
        if (bold) {
          cell.font = { bold: true };
          cell.border = { top: { style: "thin" } };
        }
      });
    };
    book.rows.forEach((r) => write(r));
    if (book.rows.length === 0) ws.addRow(["Sin movimientos en el período"]);
    if (book.totals) write(book.totals, true);
    for (const n of book.notes ?? []) {
      ws.addRow([]);
      ws.addRow([n]).getCell(1).font = { italic: true, color: { argb: "FF5F6656" } };
    }
    if (book.rows.length) ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: book.columns.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Landscape A4 PDF with repeated headers, totals and page numbers. */
export async function booksToPdf(books: Book[], meta: { orgName: string; app: string }): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 28, bufferPages: true, info: { Title: books.map((b) => b.title).join(" · "), Author: meta.app } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const usable = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const bottom = doc.page.height - doc.page.margins.bottom - 14;

  books.forEach((book, bi) => {
    if (bi > 0) doc.addPage();
    const weights = book.columns.map((c) => c.width ?? (c.type === "money" ? 13 : 12));
    const totalW = weights.reduce((a, b) => a + b, 0);
    const widths = weights.map((w) => (w / totalW) * usable);
    const fontSize = book.columns.length > 12 ? 6.2 : book.columns.length > 9 ? 7 : 8;
    const rowH = fontSize + 6;

    const title = () => {
      doc.fillColor(`#${BRAND}`).font("Helvetica-Bold").fontSize(14).text(book.title, left, doc.page.margins.top);
      doc.fillColor("#5F6656").font("Helvetica").fontSize(9).text(book.subtitle);
      doc.moveDown(0.6);
    };
    const header = () => {
      const y = doc.y;
      doc.rect(left, y, usable, rowH + 4).fill(`#${BRAND}`);
      let x = left;
      doc.fillColor("#FFFFFF").font("Helvetica-Bold").fontSize(fontSize);
      book.columns.forEach((c, i) => {
        doc.text(c.label, x + 2, y + 3, { width: widths[i] - 4, height: rowH, align: c.type === "money" || c.type === "number" ? "right" : "left", lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + rowH + 4;
    };
    const row = (r: Row, opts: { bold?: boolean; zebra?: boolean } = {}) => {
      if (doc.y + rowH > bottom) {
        doc.addPage();
        title();
        header();
      }
      const y = doc.y;
      if (opts.zebra) doc.rect(left, y, usable, rowH).fill("#F4F2EC");
      if (opts.bold) doc.moveTo(left, y).lineTo(left + usable, y).lineWidth(0.7).stroke("#1C1F17");
      let x = left;
      doc.fillColor("#1C1F17").font(opts.bold ? "Helvetica-Bold" : "Helvetica").fontSize(fontSize);
      book.columns.forEach((c, i) => {
        const v = r[c.key];
        const neg = (c.type === "money" || c.type === "number") && Number(v) < 0;
        doc.fillColor(neg ? "#B42318" : "#1C1F17");
        doc.text(fmtCell(c, v, !opts.bold), x + 2, y + 3, { width: widths[i] - 4, height: rowH, align: c.type === "money" || c.type === "number" ? "right" : "left", lineBreak: false, ellipsis: true });
        x += widths[i];
      });
      doc.y = y + rowH;
    };

    title();
    header();
    if (book.rows.length === 0) {
      doc.fillColor("#5F6656").font("Helvetica-Oblique").fontSize(9).text("Sin movimientos en el período.", left, doc.y + 6);
    }
    book.rows.forEach((r, i) => row(r, { zebra: i % 2 === 1 }));
    if (book.totals) row(book.totals, { bold: true });
    doc.moveDown(1);
    for (const n of book.notes ?? []) {
      if (doc.y + 24 > bottom) doc.addPage();
      doc.fillColor("#5F6656").font("Helvetica-Oblique").fontSize(8).text(n, left, doc.y, { width: usable });
    }
  });

  const range = doc.bufferedPageRange();
  const stamp = new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });
  for (let i = range.start; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.fillColor("#8A8F80").font("Helvetica").fontSize(7)
      .text(`${meta.orgName} · Generado con ${meta.app} el ${stamp} · Página ${i + 1} de ${range.count}`, left, doc.page.height - doc.page.margins.bottom - 8, { width: usable, align: "center", lineBreak: false });
  }
  doc.end();
  return done;
}
