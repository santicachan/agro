import "server-only";
import type { OrgContext } from "@/lib/auth";
import type { BookDocument } from "./books";

const SELECT =
  "id, type, letter, point_of_sale, number, issue_date, currency, fx_rate, net, vat, other_taxes, total, status, cae, cae_due, concept, meta, notes, source_document_id, parties(name, tax_id, tax_condition), document_lines(vat_rate, net, vat)";

type Raw = Omit<BookDocument, "party" | "lines"> & { parties: BookDocument["party"]; document_lines: BookDocument["lines"] };

const normalize = (d: Raw): BookDocument => ({
  ...d,
  fx_rate: Number(d.fx_rate),
  net: Number(d.net),
  vat: Number(d.vat),
  other_taxes: Number(d.other_taxes),
  total: Number(d.total),
  party: d.parties ?? { name: "", tax_id: null, tax_condition: null },
  lines: (d.document_lines ?? []).map((l) => ({ vat_rate: Number(l.vat_rate), net: Number(l.net), vat: Number(l.vat) })),
});

/**
 * Documents of the period plus the ones they reference (to print "asociado a").
 * Only the Blanco ledger: Gestión (Facturas X) never reaches the libros contables.
 */
export async function loadPeriodDocuments(ctx: OrgContext, from: string, to: string) {
  const docs: BookDocument[] = [];
  for (let page = 0; ; page++) {
    const { data, error } = await ctx.supabase
      .from("documents")
      .select(SELECT)
      .eq("org_id", ctx.org.id)
      .eq("ledger", "blanco")
      .in("status", ["issued", "authorized"])
      .gte("issue_date", from)
      .lte("issue_date", to)
      .order("issue_date")
      .range(page * 1000, page * 1000 + 999);
    if (error) throw new Error(error.message);
    docs.push(...((data ?? []) as unknown as Raw[]).map(normalize));
    if (!data || data.length < 1000) break;
  }
  const missing = [...new Set(docs.map((d) => d.source_document_id).filter((id): id is string => !!id && !docs.some((d) => d.id === id)))];
  let related: BookDocument[] = [];
  if (missing.length) {
    const { data } = await ctx.supabase.from("documents").select(SELECT).eq("ledger", "blanco").in("id", missing.slice(0, 500));
    related = ((data ?? []) as unknown as Raw[]).map(normalize);
  }
  return { docs, related };
}
