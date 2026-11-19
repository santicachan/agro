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
      type: "factura_compra", issueDate: "2026-11-10", currency: "ARS", fxRate: 1, pointOfSale: 12, number: 4581, lines: [{ description: "Fertilizante", quantity: 1, unitPrice: 400000, vatRate: 21 }],
    }));
    expect((await q(`select point_of_sale, number from documents where id = $1`, [fc]))[0]).toMatchObject({ point_of_sale: 12, number: 4581 });
    // Another supplier can have the same point of sale and number.
    const other = (await q<{ id: string }>(`insert into parties(org_id,kind,name,tax_condition) values ($1,'supplier','Otro proveedor','RI') returning id`, [org]))[0].id;
    await rpc(buildDocumentRpc(ORG(), { id: other, tax_condition: "RI" }, { type: "factura_compra", issueDate: "2026-11-10", currency: "ARS", fxRate: 1, pointOfSale: 12, number: 4581, lines: [{ description: "x", quantity: 1, unitPrice: 1, vatRate: 21 }] }));
    // …but the same supplier cannot load the same invoice twice.
    await expect(rpc(buildDocumentRpc(ORG(), { id: supplier, tax_condition: "RI" }, { type: "factura_compra", issueDate: "2026-11-10", currency: "ARS", fxRate: 1, pointOfSale: 12, number: 4581, lines: [{ description: "x", quantity: 1, unitPrice: 1, vatRate: 21 }] }))).rejects.toThrow(/duplicate key/);
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

  it("ND por cheque rechazado queda fechada al día de cobro", async () => {
    const [ch] = await q<{ rejection_document_id: string }>(`select rejection_document_id from cheques where bank = 'Banco Nación' and number = '00012345'`);
    const [nd] = await q<{ issue_date: string; due_date: string; ledger: string }>(`select issue_date::text, due_date::text, ledger from documents where id = $1`, [ch.rejection_document_id]);
    expect(nd).toMatchObject({ issue_date: "2026-12-02", due_date: "2026-12-02", ledger: "blanco" });
  });

  it("cuenta Gestión: Factura X, cobro con insumo/vehículo, sin mezclar con Blanco", async () => {
    const before = await balance(customer);
    const fx = await rpc(buildDocumentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "factura_venta", issueDate: "2026-11-27", currency: "ARS", fxRate: 1, ledger: "gestion", usdRate: 1500,
      lines: [{ description: "Gasoil", quantity: 1, unitPrice: 100000, vatRate: 21 }],
    }));
    const [doc] = await q<{ letter: string; ledger: string; vat: string; usd_rate: string }>(`select letter, ledger, vat, usd_rate from documents where id = $1`, [fx]);
    expect(doc).toMatchObject({ letter: "X", ledger: "gestion", usd_rate: "1500.000000" });
    // X invoices never get a CAE.
    await expect(q(`update documents set status = 'authorized', cae = '1' where id = $1`, [fx])).rejects.toThrow();
    const total = Number((await q<{ total: string }>(`select total from documents where id = $1`, [fx]))[0].total);
    const inv: InvoiceForPayment = { id: fx, type: "factura_venta", letter: "X", point_of_sale: 1, number: 1, currency: "ARS", fx_rate: 1, total, lines: [{ vat_rate: 21, net: 100000 }] };
    // A Blanco receipt cannot cancel a Gestión invoice.
    await expect(rpc(buildPaymentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "recibo", issueDate: "2026-11-28", fxRate: 1, items: [{ method: "efectivo", amount: total }], applications: [{ invoiceId: fx, amount: total }],
    }, [inv]))).rejects.toThrow(/LEDGER/);
    const receipt = await rpc(buildPaymentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "recibo", issueDate: "2026-11-28", fxRate: 1, ledger: "gestion",
      items: [{ method: "insumo", amount: total / 2, reference: "Urea 2 t" }, { method: "vehiculo", amount: total / 2, reference: "Hilux 2019" }],
      applications: [{ invoiceId: fx, amount: total }],
    }, [inv]));
    expect((await q(`select ledger from documents where id = $1`, [receipt]))[0].ledger).toBe("gestion");
    expect((await q<{ m: string }>(`select string_agg(method, ',' order by method) m from payment_items where document_id = $1`, [receipt]))[0].m).toBe("insumo,vehiculo");
    expect(await pending(fx)).toBe(0);
    expect(await balance(customer)).toBe(before);
    const ledgers = await q<{ ledger: string }>(`select distinct ledger from account_movements where party_id = $1 order by 1`, [customer]);
    expect(ledgers.map((r) => r.ledger)).toEqual(["blanco", "gestion"]);
  });

  it("cobro en dólares de una factura en dólares: se pesifica al TC del día", async () => {
    const fv = await rpc(buildDocumentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "factura_venta", issueDate: "2026-11-27", currency: "USD", fxRate: 1500, lines: [{ description: "Semilla", quantity: 1, unitPrice: 1000, vatRate: 10.5 }],
    }));
    const inv: InvoiceForPayment = { id: fv, type: "factura_venta", letter: "A", point_of_sale: 1, number: 9, currency: "USD", fx_rate: 1500, total: 1105, lines: [{ vat_rate: 10.5, net: 1000 }] };
    const receipt = await rpc(buildPaymentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "recibo", issueDate: "2026-11-29", fxRate: 1520, currency: "USD", items: [{ method: "transferencia", amount: 1105 }], applications: [{ invoiceId: fv, amount: 1105 }],
    }, [inv]));
    expect((await q(`select currency, total, usd_rate from documents where id = $1`, [receipt]))[0]).toMatchObject({ currency: "ARS", total: "1679600.00", usd_rate: "1520.000000" });
    expect((await q(`select currency, amount, amount_currency, fx_rate from payment_items where document_id = $1`, [receipt]))[0]).toMatchObject({ currency: "USD", amount: "1679600.00", amount_currency: "1105.00" });
    expect(await pending(fv)).toBe(0);
    expect(await pending(receipt)).toBe(0);
  });

  it("factura en pesos guarda el TC oficial BCRA del día de emisión", async () => {
    await db.exec(`reset role; insert into bcra_rates(date, rate) values ('2026-12-01', 1600), ('2026-12-04', 1650) on conflict (date) do update set rate = excluded.rate; set role authenticated;`);
    const fv = await rpc(buildDocumentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "factura_venta", issueDate: "2026-12-02", currency: "ARS", fxRate: 1, lines: [{ description: "Flete", quantity: 1, unitPrice: 100000, vatRate: 21 }],
    }));
    expect((await q(`select bcra_rate, bcra_rate_date::text d, usd_rate from documents where id = $1`, [fv]))[0]).toMatchObject({ bcra_rate: "1600.000000", d: "2026-12-01", usd_rate: "1600.000000" });
  });

  it("el TC BCRA se completa también en comprobantes con CAE (y nada más cambia)", async () => {
    await db.exec(`reset role; insert into bcra_rates(date, rate) values ('2026-10-30', 1490) on conflict do nothing;`);
    const [inv] = await q<{ id: string }>(`select id from documents where status = 'authorized' limit 1`);
    await db.exec(`select refresh_document_bcra_rates(); set role authenticated;`);
    const [d] = await q<{ bcra_rate: string | null }>(`select bcra_rate from documents where id = $1`, [inv.id]);
    expect(Number(d.bcra_rate)).toBeGreaterThan(0);
    await expect(q(`update documents set notes = 'x', bcra_rate = 1 where id = $1`, [inv.id])).rejects.toThrow(/LOCKED/);
  });

  it("pago parcial en USD deja la diferencia pendiente; al saldar se emite ND o NC", async () => {
    const p2 = (await q<{ id: string }>(`insert into parties(org_id,kind,name,tax_condition) values ($1,'customer','Don Pedro','RI') returning id`, [org]))[0].id;
    const party = { id: p2, tax_condition: "RI" as const };
    // $1.210.000 at 1.000 = USD 1.210
    const fv = await rpc(buildDocumentRpc(ORG(), party, {
      type: "factura_venta", issueDate: "2026-12-05", currency: "ARS", fxRate: 1, usdRate: 1000, lines: [{ description: "Glifosato", quantity: 1, unitPrice: 1_000_000, vatRate: 21 }],
    }));
    const base: InvoiceForPayment = { id: fv, type: "factura_venta", letter: "A", point_of_sale: 1, number: 20, currency: "ARS", fx_rate: 1, total: 1_210_000, lines: [{ vat_rate: 21, net: 1_000_000 }], usd_rate: 1000 };
    // USD 500 at 1.100 → $550.000 applied; the rest stays pending in pesos.
    await rpc(buildPaymentRpc(ORG(), party, {
      type: "recibo", issueDate: "2026-12-06", fxRate: 1100, currency: "USD", items: [{ method: "efectivo", amount: 500 }], applications: [{ invoiceId: fv, amount: 550_000 }],
    }, [base]));
    expect(await pending(fv)).toBe(660_000);
    // Settle the remaining USD 710 at 1.200 = $852.000 → ND $192.000.
    const r2 = await rpc(buildPaymentRpc(ORG(), party, {
      type: "recibo", issueDate: "2026-12-07", fxRate: 1200, currency: "USD", items: [{ method: "transferencia", amount: 710 }], applications: [{ invoiceId: fv, amount: 0, settle: true }],
    }, [{ ...base, pending: 660_000, usd_paid: 500 }]));
    const [nd] = await q<{ id: string; type: string; total: string }>(`select id, type, total from documents where source_document_id = $1 and concept = 'diferencia_cambio'`, [fv]);
    expect(nd).toMatchObject({ type: "nota_debito_venta", total: "192000.00" });
    expect(await pending(fv)).toBe(0);
    expect(await pending(nd.id)).toBe(0);
    expect(await pending(r2)).toBe(0);
    expect(await balance(p2)).toBe(0);

    // Peso got stronger → NC.
    const fv2 = await rpc(buildDocumentRpc(ORG(), party, {
      type: "factura_venta", issueDate: "2026-12-08", currency: "ARS", fxRate: 1, usdRate: 1000, lines: [{ description: "Semilla", quantity: 1, unitPrice: 100_000, vatRate: 21 }],
    }));
    const r3 = await rpc(buildPaymentRpc(ORG(), party, {
      type: "recibo", issueDate: "2026-12-09", fxRate: 900, items: [{ method: "transferencia", amount: 108_900 }], applications: [{ invoiceId: fv2, amount: 0, settle: true }],
    }, [{ ...base, id: fv2, total: 121_000, lines: [{ vat_rate: 21, net: 100_000 }], pending: 121_000, usd_paid: 0 }]));
    const [nc] = await q<{ type: string; total: string }>(`select type, total from documents where source_document_id = $1 and concept = 'diferencia_cambio'`, [fv2]);
    expect(nc).toMatchObject({ type: "nota_credito_venta", total: "12100.00" });
    expect(await pending(fv2)).toBe(0);
    expect(await pending(r3)).toBe(0);
    expect(await balance(p2)).toBe(0);
  });

  it("cheque en dólares dentro de un cobro pesificado", async () => {
    const receipt = await rpc(buildPaymentRpc(ORG(), { id: customer, tax_condition: "RI" }, {
      type: "recibo", issueDate: "2026-12-10", fxRate: 1500, currency: "USD", items: [{ method: "cheque", amount: 100, cheque: { bank: "Galicia", number: "U1", paymentDate: "2026-12-20" } }], applications: [],
    }, []));
    expect((await q(`select currency, amount from cheques where received_document_id = $1`, [receipt]))[0]).toMatchObject({ currency: "USD", amount: "100.00" });
    expect((await q(`select total from documents where id = $1`, [receipt]))[0].total).toBe("150000.00");
  });

  it("canje con camioneta o insumos", async () => {
    await q(`insert into grain_swaps(org_id, party_id, kind, description, unit, tons, price_usd_t) values ($1, $2, 'camioneta', 'Toyota Hilux 2021', 'u', 1, 30000)`, [org, customer]);
    await q(`insert into grain_swaps(org_id, party_id, kind, description, unit, tons, price_usd_t) values ($1, $2, 'insumos', 'Glifosato bidón 20 L', 'bidón', 50, 90)`, [org, customer]);
    await expect(q(`insert into grain_swaps(org_id, party_id, kind, tons, price_usd_t) values ($1, $2, 'granos', 10, 300)`, [org, customer])).rejects.toThrow();
    expect((await q(`select count(*)::int n from grain_swaps where kind <> 'granos'`))[0].n).toBe(2);
  });

  it("plan gratis no ve ni crea datos del CRM", async () => {
    await db.exec(`reset role; update organizations set plan_id = 'free' where id = '${org}'; set role authenticated;`);
    expect((await q(`select count(*)::int n from documents`))[0].n).toBe(0);
    await expect(q(`insert into parties(org_id,kind,name) values ($1,'customer','X')`, [org])).rejects.toThrow(/row-level security/);
    await db.exec(`reset role; update organizations set plan_id = 'pro' where id = '${org}'; set role authenticated;`);
  });
});
