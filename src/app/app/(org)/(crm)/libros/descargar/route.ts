import { NextResponse } from "next/server";
import { requireCrm } from "@/lib/auth";
import { BOOKS, buildBook, buildStatementBook, isBookId, periodLabel, periodRange, type Book } from "@/lib/books/books";
import { loadPeriodDocuments } from "@/lib/books/load";
import { booksToPdf, booksToXlsx } from "@/lib/books/render";
import { DOC_TYPES, formatDocNumber } from "@/lib/crm/documents";
import { accountStatement, getParty } from "@/lib/crm/queries";
import { site } from "@/lib/site";

export const dynamic = "force-dynamic";
// exceljs/pdfkit need the Node.js runtime.
export const runtime = "nodejs";

const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();

/**
 * GET /app/libros/descargar?libro=iva-ventas|...|todos|cuenta-corriente&formato=xlsx|pdf&anio=2026&mes=11
 * Cuenta corriente: &parte=<id>&desde=&hasta=
 */
export async function GET(req: Request) {
  const ctx = await requireCrm();
  const url = new URL(req.url);
  const libro = url.searchParams.get("libro") ?? "todos";
  const formato = url.searchParams.get("formato") === "pdf" ? "pdf" : "xlsx";
  const meta = { orgName: ctx.org.name, app: site.name };
  const cur = ctx.org.base_currency;
  let books: Book[];
  let filename: string;

  if (libro === "cuenta-corriente") {
    const partyId = url.searchParams.get("parte") ?? "";
    const party = await getParty(ctx, partyId);
    if (!party) return NextResponse.json({ error: "Cliente/proveedor inexistente" }, { status: 404 });
    const kind = party.kind === "supplier" ? "supplier" : "customer";
    const sign = kind === "customer" ? 1 : -1;
    const range = { from: isDate(url.searchParams.get("desde")), to: isDate(url.searchParams.get("hasta")) };
    const { opening, rows } = await accountStatement(ctx, partyId, range);
    const { rows: all } = await accountStatement(ctx, partyId);
    const numbers = new Map(all.map((r) => [r.document_id, `${DOC_TYPES[r.type].short} ${r.letter ?? ""} ${formatDocNumber(r.point_of_sale, r.number)}`.replace(/\s+/g, " ")]));
    const fmt = (d?: string) => (d ? d.split("-").reverse().join("/") : "");
    const period = range.from || range.to ? `${range.from ? `Desde ${fmt(range.from)}` : ""} ${range.to ? `hasta ${fmt(range.to)}` : ""}`.trim() : `Al ${fmt(new Date().toISOString().slice(0, 10))}`;
    books = [
      buildStatementBook(
        rows.map((r) => ({ ...r, amount: r.amount * sign, source: r.source_document_id ? (numbers.get(r.source_document_id) ?? null) : null })),
        { orgName: ctx.org.name, partyName: party.name, partyTaxId: party.tax_id, currency: cur, period, opening: opening * sign, kind },
      ),
    ];
    filename = `cuenta-corriente-${slug(party.name)}`;
  } else {
    const year = Number(url.searchParams.get("anio")) || new Date().getFullYear();
    const monthParam = Number(url.searchParams.get("mes"));
    const month = monthParam >= 1 && monthParam <= 12 ? monthParam : null;
    const { from, to } = periodRange(year, month);
    const { docs, related } = await loadPeriodDocuments(ctx, from, to);
    const opts = { orgName: ctx.org.name, currency: cur, period: periodLabel(year, month), related };
    const ids = libro === "todos" ? BOOKS.map((b) => b.id) : isBookId(libro) ? [libro] : null;
    if (!ids) return NextResponse.json({ error: "Libro inexistente" }, { status: 400 });
    books = ids.map((id) => buildBook(id, docs, opts));
    filename = `${libro === "todos" ? "libros-contables" : libro}-${year}${month ? `-${String(month).padStart(2, "0")}` : ""}-${slug(ctx.org.name)}`;
  }

  const body = formato === "pdf" ? await booksToPdf(books, meta) : await booksToXlsx(books, meta);
  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Content-Type": formato === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}.${formato}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
