/**
 * Runs every migration + seed on an embedded Postgres (PGlite) with Supabase
 * stubs, then walks the full commercial flow as an authenticated user so RLS,
 * triggers and RPCs are exercised exactly like in production.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { buildDocumentRpc, buildPaymentRpc, type InvoiceForPayment } from "@/lib/crm/payloads";

const root = join(__dirname, "..");
const USER = "11111111-1111-1111-1111-111111111111";
let db: PGlite;
let org: string;
let customer: string;
let supplier: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const rpc = async (args: Record<string, unknown>) =>
  (await q<{ id: string }>(`select create_document($1::jsonb, $2::jsonb, $3::jsonb, $4::jsonb, $5::jsonb) as id`, [
    JSON.stringify(args.p_doc), JSON.stringify(args.p_lines ?? []), JSON.stringify(args.p_payments ?? []),
    JSON.stringify(args.p_applications ?? []), JSON.stringify(args.p_fx_notes ?? []),
  ]))[0].id;
const balance = async (party: string) => Number((await q<{ s: string }>(`select coalesce(sum(amount),0) s from account_movements where party_id = $1`, [party]))[0].s);
const pending = async (id: string) => Number((await q<{ p: string }>(`select pending p from document_balances where id = $1`, [id]))[0].p);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create schema storage; create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name,'/') $$;`);
  for (const f of readdirSync(join(root, "migrations")).sort()) await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
  await db.exec(`grant usage on schema public to authenticated; grant all on all tables in schema public to authenticated;
    grant execute on all functions in schema public to authenticated;
    revoke update on public.organizations from authenticated;
    grant update (name, tax_id, tax_condition, region, base_currency, arca_config) on public.organizations to authenticated;
    insert into auth.users values ('${USER}'); set request.jwt.claim.sub = '${USER}';`);
  org = (await q<{ id: string }>(`select create_organization('Agro Demo SA','30-71234567-9','AR') as id`))[0].id;
  await db.exec(`update organizations set plan_id = 'pro', tax_condition = 'RI' where id = '${org}'; set role authenticated;`);
  customer = (await q<{ id: string }>(`insert into parties(org_id,kind,name,tax_id,tax_condition) values ($1,'customer','Estancia La Esperanza','20-12345678-6','RI') returning id`, [org]))[0].id;
  supplier = (await q<{ id: string }>(`insert into parties(org_id,kind,name,tax_id,tax_condition) values ($1,'supplier','Agroinsumos SRL','30-70000000-1','RI') returning id`, [org]))[0].id;
});

const ORG = () => ({ id: org, base_currency: "ARS", tax_condition: "RI" as const });

describe("flujo comercial completo", () => {
  let invoice: string;

  it("factura USD + remito vinculado", async () => {
    invoice = await rpc(buildDocumentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "factura_venta", issueDate: "2026-11-02", currency: "USD", fxRate: 1500,
      lines: [{ description: "Glifosato", quantity: 10, unitPrice: 100, vatRate: 21 }, { description: "Semilla", quantity: 10, unitPrice: 50, vatRate: 10.5 }],
    }));
    const remito = await rpc(buildDocumentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "remito", issueDate: "2026-11-02", currency: "USD", fxRate: 1500, sourceDocumentId: invoice,
      lines: [{ description: "Glifosato", quantity: 10, unitPrice: 100, vatRate: 21 }],
    }));
    const [inv] = await q<{ letter: string; number: string; total: string }>(`select letter, number, total from documents where id = $1`, [invoice]);
    expect(inv).toMatchObject({ letter: "A", total: "1762.50" });
    expect((await q(`select source_document_id from documents where id = $1`, [remito]))[0].source_document_id).toBe(invoice);
    expect(await balance(customer)).toBe(1762.5 * 1500); // remito doesn't move the balance
    expect(await pending(invoice)).toBe(1762.5);
  });

  it("CAE bloquea el comprobante", async () => {
    await q(`update documents set status = 'authorized', cae = '76123456789012', cae_due = '2026-11-12' where id = $1`, [invoice]);
    await expect(q(`update documents set notes = 'x' where id = $1`, [invoice])).rejects.toThrow(/LOCKED/);
    await expect(q(`delete from documents where id = $1`, [invoice])).rejects.toThrow(/LOCKED/);
    await expect(q(`update document_lines set net = 1 where document_id = $1`, [invoice])).rejects.toThrow(/LOCKED/);
  });

  it("cobro a otro TC → recibo + ND por diferencia de cambio, factura pagada y saldo cero", async () => {
    const lines = await q<{ vat_rate: string; net: string }>(`select vat_rate, net from document_lines where document_id = $1`, [invoice]);
    const inv: InvoiceForPayment = { id: invoice, type: "factura_venta", letter: "A", point_of_sale: 1, number: 1, currency: "USD", fx_rate: 1500, total: 1762.5, lines: lines.map((l) => ({ vat_rate: Number(l.vat_rate), net: Number(l.net) })) };
    const paid = 1762.5 * 1550;
    const receipt = await rpc(buildPaymentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "recibo", issueDate: "2026-11-20", fxRate: 1550,
      items: [{ method: "cheque", amount: paid, cheque: { bank: "Banco Nación", number: "00012345", paymentDate: "2026-12-01" } }],
      applications: [{ invoiceId: invoice, amount: 1762.5 }],
    }, [inv]));
    const [nd] = await q<{ id: string; type: string; total: string; concept: string; letter: string }>(`select id, type, total, concept, letter from documents where concept = 'diferencia_cambio'`);
    expect(nd).toMatchObject({ type: "nota_debito_venta", total: "88125.00", letter: "A" });
    expect((await q(`select count(*)::int n from document_lines where document_id = $1`, [nd.id]))[0].n).toBe(2);
    expect(await pending(invoice)).toBe(0);
    expect(await pending(nd.id)).toBe(0);
    expect(await pending(receipt)).toBe(0);
    expect(await balance(customer)).toBe(0);
  });

  it("cheque rechazado → ND automática al cliente con gastos", async () => {
    const [ch] = await q<{ id: string }>(`select id from cheques where status = 'en_cartera'`);
    const ndId = (await q<{ id: string }>(`select reject_cheque($1, 5000, 21, 'Sin fondos', '2026-12-02') as id`, [ch.id]))[0].id;
    const [nd] = await q<{ type: string; concept: string; total: string; net: string; vat: string }>(`select type, concept, total, net, vat from documents where id = $1`, [ndId]);
    expect(nd).toMatchObject({ type: "nota_debito_venta", concept: "cheque_rechazado", vat: "1050.00" });
    expect(Number(nd.total)).toBe(1762.5 * 1550 + 5000 + 1050);
    expect((await q(`select status, rejection_document_id from cheques where id = $1`, [ch.id]))[0]).toMatchObject({ status: "rechazado", rejection_document_id: ndId });
    expect(await balance(customer)).toBe(Number(nd.total));
  });

  it("factura de compra → orden de pago con cheque endosado; si rebota, el proveedor nos debita", async () => {
    // New receipt with a third-party cheque to endorse.
    await rpc(buildPaymentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "recibo", issueDate: "2026-11-21", fxRate: 1, items: [{ method: "cheque", amount: 484000, cheque: { bank: "Galicia", number: "777", paymentDate: "2026-12-10" } }], applications: [],
    }, []));
    const fc = await rpc(buildDocumentRpc(ORG(), { id: supplier, tax_condition: "RI" }, {
      type: "factura_compra", issueDate: "2026-11-10", currency: "ARS", fxRate: 1, lines: [{ description: "Fertilizante", quantity: 1, unitPrice: 400000, vatRate: 21 }],
    }));
    expect((await q(`select letter from documents where id = $1`, [fc]))[0].letter).toBe("A");
    expect(await balance(supplier)).toBe(-484000);
    const [ch] = await q<{ id: string }>(`select id from cheques where number = '777'`);
    const op = await rpc(buildPaymentRpc(ORG(), { id: supplier, tax_condition: "RI" }, {
      type: "orden_pago", issueDate: "2026-11-22", fxRate: 1, items: [{ method: "cheque", amount: 484000, chequeId: ch.id }], applications: [{ invoiceId: fc, amount: 484000 }],
    }, [{ id: fc, type: "factura_compra", letter: "A", point_of_sale: 1, number: 1, currency: "ARS", fx_rate: 1, total: 484000, lines: [{ vat_rate: 21, net: 400000 }] }]));
    expect(await pending(fc)).toBe(0);
    expect(await balance(supplier)).toBe(0);
    expect((await q(`select status, delivered_document_id from cheques where id = $1`, [ch.id]))[0]).toMatchObject({ status: "endosado", delivered_document_id: op });
    await q(`select reject_cheque($1, 0, 21, null, '2026-12-11')`, [ch.id]);
    expect(await balance(supplier)).toBe(-484000); // the supplier charges the bounced cheque back
  });

  it("nota de crédito asociada reduce el pendiente de la factura", async () => {
    const fv = await rpc(buildDocumentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "factura_venta", issueDate: "2026-11-25", currency: "ARS", fxRate: 1, lines: [{ description: "Flete", quantity: 1, unitPrice: 100000, vatRate: 21 }],
    }));
    await rpc(buildDocumentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "nota_credito_venta", issueDate: "2026-11-26", currency: "ARS", fxRate: 1, sourceDocumentId: fv, applyToSource: 12100,
      lines: [{ description: "Bonificación", quantity: 1, unitPrice: 10000, vatRate: 21 }],
    }));
    expect(await pending(fv)).toBe(121000 - 12100);
  });

  it("cobro con dólar más bajo → NC por diferencia de cambio y saldo cero", async () => {
    const other = (await q<{ id: string }>(`insert into parties(org_id,kind,name,tax_condition) values ($1,'customer','Campo Sur','MONO') returning id`, [org]))[0].id;
    const fv = await rpc(buildDocumentRpc(ORG(), { id: other, tax_condition: "MONO" }, {
      type: "factura_venta", issueDate: "2026-11-03", currency: "USD", fxRate: 1500, lines: [{ description: "Servicio de siembra", quantity: 1, unitPrice: 1000, vatRate: 21 }],
    }));
    expect((await q(`select letter from documents where id = $1`, [fv]))[0].letter).toBe("B");
    const receipt = await rpc(buildPaymentRpc(ORG(), { id: other, tax_condition: "MONO" }, {
      type: "recibo", issueDate: "2026-11-28", fxRate: 1450, items: [{ method: "transferencia", amount: 1210 * 1450 }], applications: [{ invoiceId: fv, amount: 1210 }],
    }, [{ id: fv, type: "factura_venta", letter: "B", point_of_sale: 1, number: 2, currency: "USD", fx_rate: 1500, total: 1210, lines: [{ vat_rate: 21, net: 1000 }] }]));
    const [nc] = await q<{ type: string; total: string }>(`select type, total from documents where concept = 'diferencia_cambio' and party_id = $1`, [other]);
    expect(nc).toMatchObject({ type: "nota_credito_venta", total: "60500.00" });
    expect(await pending(fv)).toBe(0);
    expect(await pending(receipt)).toBe(0);
    expect(await balance(other)).toBe(0);
  });

  it("plan gratis no ve ni crea datos del CRM", async () => {
    await db.exec(`reset role; update organizations set plan_id = 'free' where id = '${org}'; set role authenticated;`);
    expect((await q(`select count(*)::int n from documents`))[0].n).toBe(0);
    await expect(q(`insert into parties(org_id,kind,name) values ($1,'customer','X')`, [org])).rejects.toThrow(/row-level security/);
    await db.exec(`reset role; update organizations set plan_id = 'pro' where id = '${org}'; set role authenticated;`);
  });
});
