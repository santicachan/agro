-- CAMPAGROX: tipo de cambio oficial BCRA en cada comprobante, pagos en dólares
-- pesificados al TC del día y liquidación de la diferencia de cambio (ND/NC).
-- Additive only: new table and nullable columns; existing rows are only filled
-- where the new columns are null.

-- ───────────────────────────────────────────── BCRA: Comunicación A 3500 (reference data, shared by every org)
create table if not exists public.bcra_rates (
  date date primary key,
  rate numeric(16,6) not null check (rate > 0),
  source text not null default 'BCRA Com. A 3500',
  fetched_at timestamptz not null default now()
);
alter table public.bcra_rates enable row level security;
drop policy if exists bcra_rates_read on public.bcra_rates;
create policy bcra_rates_read on public.bcra_rates for select using (true);
grant select on public.bcra_rates to anon, authenticated;

-- History published by the BCRA (api.bcra.gob.ar, variable 5) for 2026.
insert into public.bcra_rates(date, rate) values
  ('2026-01-02', 1469.613),
  ('2026-01-05', 1472.7348),
  ('2026-01-06', 1467.6208),
  ('2026-01-07', 1466.0309),
  ('2026-01-08', 1459.5816),
  ('2026-01-09', 1466.4689),
  ('2026-01-12', 1466.646),
  ('2026-01-13', 1463.3168),
  ('2026-01-14', 1454.3238),
  ('2026-01-15', 1443.8584),
  ('2026-01-16', 1431.055),
  ('2026-01-19', 1432.6913),
  ('2026-01-20', 1435.6263),
  ('2026-01-21', 1429.7799),
  ('2026-01-22', 1427.0331),
  ('2026-01-23', 1433.1999),
  ('2026-01-26', 1438.4603),
  ('2026-01-27', 1441.3245),
  ('2026-01-28', 1442.6959),
  ('2026-01-29', 1446.301),
  ('2026-01-30', 1447.6657),
  ('2026-02-02', 1451.701),
  ('2026-02-03', 1447.6651),
  ('2026-02-04', 1447.6232),
  ('2026-02-05', 1445.6242),
  ('2026-02-06', 1430.589),
  ('2026-02-09', 1423.3639),
  ('2026-02-10', 1405.427),
  ('2026-02-11', 1403.6981),
  ('2026-02-12', 1394.154),
  ('2026-02-13', 1395.4205),
  ('2026-02-18', 1401.8091),
  ('2026-02-19', 1391.9703),
  ('2026-02-20', 1384.205),
  ('2026-02-23', 1367.2357),
  ('2026-02-24', 1377.0942),
  ('2026-02-25', 1388.5847),
  ('2026-02-26', 1408.6966),
  ('2026-02-27', 1408.9662),
  ('2026-03-02', 1401.5785),
  ('2026-03-03', 1411.1067),
  ('2026-03-04', 1401.5797),
  ('2026-03-05', 1407.1504),
  ('2026-03-06', 1413.8218),
  ('2026-03-09', 1418.2781),
  ('2026-03-10', 1402.3816),
  ('2026-03-11', 1396.4528),
  ('2026-03-12', 1399.6749),
  ('2026-03-13', 1392.9851),
  ('2026-03-16', 1394.655),
  ('2026-03-17', 1395.5134),
  ('2026-03-18', 1399.6042),
  ('2026-03-19', 1395.5142),
  ('2026-03-20', 1393.438),
  ('2026-03-25', 1378.9689),
  ('2026-03-26', 1370.2909),
  ('2026-03-27', 1376.0989),
  ('2026-03-30', 1394.9234),
  ('2026-03-31', 1382.7578),
  ('2026-04-01', 1387.7212),
  ('2026-04-06', 1391.6887),
  ('2026-04-07', 1395.0979),
  ('2026-04-08', 1387.0308),
  ('2026-04-09', 1383.2312),
  ('2026-04-10', 1373.9033),
  ('2026-04-13', 1362.8139),
  ('2026-04-14', 1358.522),
  ('2026-04-15', 1363.6566),
  ('2026-04-16', 1352.9774),
  ('2026-04-17', 1360.0307),
  ('2026-04-20', 1372.7745),
  ('2026-04-21', 1379.0516),
  ('2026-04-22', 1378.1258),
  ('2026-04-23', 1387.6961),
  ('2026-04-24', 1397.2063),
  ('2026-04-27', 1412.9865),
  ('2026-04-28', 1408.1491),
  ('2026-04-29', 1395.2866),
  ('2026-04-30', 1381.0954),
  ('2026-05-04', 1398.3143),
  ('2026-05-05', 1395.1909),
  ('2026-05-06', 1386.2923),
  ('2026-05-07', 1390.637),
  ('2026-05-08', 1394.1232),
  ('2026-05-11', 1399.4749),
  ('2026-05-12', 1386.5259),
  ('2026-05-13', 1389.2073),
  ('2026-05-14', 1393.2322),
  ('2026-05-15', 1395.3478),
  ('2026-05-18', 1394.974),
  ('2026-05-19', 1398.916),
  ('2026-05-20', 1398.8346),
  ('2026-05-21', 1392.1705),
  ('2026-05-22', 1393.5019),
  ('2026-05-26', 1407.8893),
  ('2026-05-27', 1411.1796),
  ('2026-05-28', 1411.4054),
  ('2026-05-29', 1410.2904),
  ('2026-06-01', 1421.4672),
  ('2026-06-02', 1426.9788),
  ('2026-06-03', 1435.3812),
  ('2026-06-04', 1438.8159),
  ('2026-06-05', 1442.4148),
  ('2026-06-08', 1445.3978),
  ('2026-06-09', 1446.1668),
  ('2026-06-10', 1436.585),
  ('2026-06-11', 1429.0298),
  ('2026-06-12', 1430.8092),
  ('2026-06-16', 1432.6696),
  ('2026-06-17', 1439.2199),
  ('2026-06-18', 1449.5799),
  ('2026-06-19', 1460.2498),
  ('2026-06-22', 1457.3057),
  ('2026-06-23', 1469.9138),
  ('2026-06-24', 1478.0437),
  ('2026-06-25', 1477.2991),
  ('2026-06-26', 1474.7207),
  ('2026-06-29', 1480.6598),
  ('2026-06-30', 1483.0198),
  ('2026-07-01', 1487.769),
  ('2026-07-02', 1490.6754),
  ('2026-07-03', 1488.5858),
  ('2026-07-06', 1489.5949),
  ('2026-07-07', 1491.55),
  ('2026-07-08', 1490.9024),
  ('2026-07-13', 1486.0549),
  ('2026-07-14', 1474.7373),
  ('2026-07-15', 1475.4431),
  ('2026-07-16', 1474.7696),
  ('2026-07-17', 1480.1223),
  ('2026-07-20', 1480.175),
  ('2026-07-21', 1477.7),
  ('2026-07-22', 1480.8616),
  ('2026-07-23', 1489.7656),
  ('2026-07-24', 1494.3744),
  ('2026-07-27', 1498.5117),
  ('2026-07-28', 1499.8387),
  ('2026-07-29', 1496.3521),
  ('2026-07-30', 1490.8431),
  ('2026-07-31', 1488.4531),
  ('2026-08-03', 1493.4428),
  ('2026-08-04', 1496.4509),
  ('2026-08-05', 1496.3132),
  ('2026-08-06', 1497.0062),
  ('2026-08-07', 1498.4355),
  ('2026-08-10', 1498.0939),
  ('2026-08-11', 1492.179),
  ('2026-08-12', 1492.5477),
  ('2026-08-13', 1491.8387),
  ('2026-08-14', 1488.6984),
  ('2026-08-18', 1494.1268),
  ('2026-08-19', 1497.5332),
  ('2026-08-20', 1497.2898),
  ('2026-08-21', 1497.4528),
  ('2026-08-24', 1506.9002),
  ('2026-08-25', 1511.5326),
  ('2026-08-26', 1514.1634),
  ('2026-08-27', 1512.7498),
  ('2026-08-28', 1513.0352),
  ('2026-08-31', 1509.4686),
  ('2026-09-01', 1512.7304),
  ('2026-09-02', 1511.6306),
  ('2026-09-03', 1508.2111),
  ('2026-09-04', 1507.3745),
  ('2026-09-07', 1511.154),
  ('2026-09-08', 1510.1049),
  ('2026-09-09', 1515.1105),
  ('2026-09-10', 1512.9956),
  ('2026-09-11', 1509.9074),
  ('2026-09-14', 1510.3215),
  ('2026-09-15', 1506.6836),
  ('2026-09-16', 1509.1055),
  ('2026-09-17', 1510.0024),
  ('2026-09-18', 1512.3332),
  ('2026-09-21', 1514.9134),
  ('2026-09-22', 1513.6838),
  ('2026-09-23', 1516.2964),
  ('2026-09-24', 1518.7415),
  ('2026-09-25', 1523.9662),
  ('2026-09-28', 1528.7563),
  ('2026-09-29', 1523.9697),
  ('2026-09-30', 1517.5209),
  ('2026-10-01', 1523.2254),
  ('2026-10-02', 1523.0868),
  ('2026-10-05', 1519.2481),
  ('2026-10-06', 1520.3002),
  ('2026-10-07', 1520.7136),
  ('2026-10-08', 1518.4363),
  ('2026-10-09', 1515.8766),
  ('2026-10-13', 1515.8543),
  ('2026-10-14', 1514.5655),
  ('2026-10-15', 1513.9308),
  ('2026-10-16', 1514.5655),
  ('2026-10-19', 1523.3466),
  ('2026-10-20', 1524.8401),
  ('2026-10-21', 1526.6664),
  ('2026-10-22', 1527.8511),
  ('2026-10-23', 1528.263),
  ('2026-10-26', 1540.4751),
  ('2026-10-27', 1538.741),
  ('2026-10-28', 1538.4739),
  ('2026-10-29', 1539.593),
  ('2026-10-30', 1537.3487),
  ('2026-11-02', 1544.6507),
  ('2026-11-03', 1549.7194),
  ('2026-11-04', 1548.4941),
  ('2026-11-05', 1545.3974),
  ('2026-11-11', 1547.9128),
  ('2026-11-12', 1544.432),
  ('2026-11-13', 1547.0336),
  ('2026-11-16', 1549.6732),
  ('2026-11-17', 1552.2627),
  ('2026-11-18', 1558.2427)
on conflict (date) do nothing;

-- ───────────────────────────────────────────── Documents & payment items
alter table public.documents add column if not exists bcra_rate numeric(16,6);   -- BCRA Com. A 3500 of the issue day
alter table public.documents add column if not exists bcra_rate_date date;       -- date of that rate (previous business day on holidays)
alter table public.payment_items add column if not exists currency text;          -- currency actually received/paid (USD for dollars)
alter table public.payment_items add column if not exists fx_rate numeric(16,6);  -- pesos per unit of that currency
alter table public.payment_items add column if not exists amount_currency numeric(16,2); -- amount in that currency

-- Authorized documents stay immutable, except for filling/refining the informative BCRA rate.
create or replace function public.protect_authorized_documents() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'authorized' then
    if tg_op = 'UPDATE'
       and (to_jsonb(new) - 'bcra_rate' - 'bcra_rate_date' - 'usd_rate') = (to_jsonb(old) - 'bcra_rate' - 'bcra_rate_date' - 'usd_rate')
       and (old.usd_rate is null or new.usd_rate is not distinct from old.usd_rate)
       and (old.bcra_rate_date is null or new.bcra_rate_date >= old.bcra_rate_date) then
      return new;
    end if;
    raise exception 'LOCKED: el comprobante tiene CAE % y no se puede modificar ni borrar. Para corregirlo emití una nota de crédito.', old.cae
      using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;

/** Fills (or refines, once the day's rate is published) the BCRA rate of documents. */
create or replace function public.refresh_document_bcra_rates() returns integer
language plpgsql security invoker set search_path = public as $$
declare v_n integer;
begin
  with x as (
    select d.id, b.date, b.rate
      from documents d
      cross join lateral (select r.date, r.rate from bcra_rates r where r.date <= d.issue_date order by r.date desc limit 1) b
     where d.bcra_rate_date is null or d.bcra_rate_date < b.date)
  update documents d set bcra_rate = x.rate, bcra_rate_date = x.date,
         usd_rate = coalesce(d.usd_rate, case when d.currency = 'USD' then d.fx_rate else x.rate end)
    from x where x.id = d.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- Backfill every existing document with the rate of its issue date.
select public.refresh_document_bcra_rates();

-- ───────────────────────────────────────────── Balances: a settlement ND is paid by the same receipt
create or replace view public.document_balances with (security_invoker = true) as
select d.id, d.org_id, d.party_id, d.type, d.currency, d.total,
  case
    when d.type in ('factura_venta','nota_debito_venta','factura_compra','nota_debito_compra') then
      round(d.total - coalesce((select sum(a.amount) from public.applications a where a.invoice_document_id = d.id), 0), 2)
    when d.type in ('recibo','orden_pago','nota_credito_venta','nota_credito_compra') and d.concept is null then
      round(d.total - coalesce((select sum(a.amount * a.fx_rate) from public.applications a
                                 join public.documents i on i.id = a.invoice_document_id
                                where a.payment_document_id = d.id
                                  and (i.concept is distinct from 'diferencia_cambio' or i.meta->>'mode' = 'liquidacion')), 0), 2)
    else 0
  end as pending,
  d.ledger
from public.documents d
where d.status in ('issued','authorized');

-- ───────────────────────────────────────────── create_document: BCRA rate, pagos en USD pesificados, liquidación de diferencia de cambio
create or replace function public.create_document(
  p_doc jsonb,
  p_lines jsonb default '[]'::jsonb,
  p_payments jsonb default '[]'::jsonb,
  p_applications jsonb default '[]'::jsonb,
  p_fx_notes jsonb default '[]'::jsonb
) returns uuid
language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid;
  v_org uuid := (p_doc->>'org_id')::uuid;
  v_ledger text := coalesce(nullif(p_doc->>'ledger',''), 'blanco');
  v_currency text := coalesce(p_doc->>'currency','ARS');
  v_line jsonb;
  v_pay jsonb;
  v_app jsonb;
  v_cheque uuid;
  v_note jsonb;
  v_note_id uuid;
  v_issue date := coalesce(nullif(p_doc->>'issue_date','')::date, current_date);
  v_bcra record;
begin
  select b.date, b.rate into v_bcra from bcra_rates b where b.date <= v_issue order by b.date desc limit 1;
  insert into documents(org_id, party_id, type, letter, point_of_sale, number, issue_date, due_date, currency, fx_rate,
                        net, vat, other_taxes, total, status, source_document_id, notes, created_by, concept, meta, ledger, usd_rate,
                        bcra_rate, bcra_rate_date)
  values (v_org, (p_doc->>'party_id')::uuid, p_doc->>'type', nullif(p_doc->>'letter',''),
          coalesce((p_doc->>'point_of_sale')::int, 1), nullif(p_doc->>'number','')::bigint, v_issue,
          nullif(p_doc->>'due_date','')::date, v_currency, coalesce((p_doc->>'fx_rate')::numeric, 1),
          coalesce((p_doc->>'net')::numeric, 0), coalesce((p_doc->>'vat')::numeric, 0), coalesce((p_doc->>'other_taxes')::numeric, 0),
          coalesce((p_doc->>'total')::numeric, 0), coalesce(p_doc->>'status','issued'),
          nullif(p_doc->>'source_document_id','')::uuid, p_doc->>'notes', auth.uid(),
          nullif(p_doc->>'concept',''), coalesce(p_doc->'meta', '{}'::jsonb), v_ledger,
          coalesce(nullif(p_doc->>'usd_rate','')::numeric, case when v_currency = 'USD' then (p_doc->>'fx_rate')::numeric else v_bcra.rate end),
          coalesce(nullif(p_doc->>'bcra_rate','')::numeric, v_bcra.rate),
          coalesce(nullif(p_doc->>'bcra_rate_date','')::date, v_bcra.date))
  returning id into v_id;

  -- A document only links to documents of its own ledger.
  if nullif(p_doc->>'source_document_id','') is not null and exists (
       select 1 from documents s where s.id = (p_doc->>'source_document_id')::uuid and s.ledger <> v_ledger) then
    raise exception 'LEDGER: el comprobante asociado pertenece a otra cuenta (Blanco / Gestión)' using errcode = 'P0001';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    insert into document_lines(document_id, org_id, product_id, description, quantity, unit, unit_price, vat_rate, net, vat)
    values (v_id, v_org, nullif(v_line->>'product_id','')::uuid, v_line->>'description', (v_line->>'quantity')::numeric,
            coalesce(v_line->>'unit','u'), (v_line->>'unit_price')::numeric, (v_line->>'vat_rate')::numeric,
            (v_line->>'net')::numeric, (v_line->>'vat')::numeric);
  end loop;

  for v_pay in select * from jsonb_array_elements(p_payments) loop
    v_cheque := nullif(v_pay->>'cheque_id','')::uuid;
    if v_pay->>'method' in ('cheque','echeq') then
      if v_cheque is null then
        insert into cheques(org_id, kind, electronic, bank, number, drawer_name, drawer_tax_id, amount, issue_date, payment_date, status,
                            received_document_id, received_from, delivered_document_id, delivered_to, currency)
        values (v_org,
                case when p_doc->>'type' = 'orden_pago' then 'propio' else 'tercero' end,
                v_pay->>'method' = 'echeq', v_pay->'cheque'->>'bank', v_pay->'cheque'->>'number',
                v_pay->'cheque'->>'drawer_name', v_pay->'cheque'->>'drawer_tax_id', coalesce(nullif(v_pay->>'amount_currency','')::numeric, (v_pay->>'amount')::numeric),
                nullif(v_pay->'cheque'->>'issue_date','')::date, (v_pay->'cheque'->>'payment_date')::date,
                case when p_doc->>'type' = 'orden_pago' then 'emitido' else 'en_cartera' end,
                case when p_doc->>'type' = 'orden_pago' then null else v_id end,
                case when p_doc->>'type' = 'orden_pago' then null else (p_doc->>'party_id')::uuid end,
                case when p_doc->>'type' = 'orden_pago' then v_id else null end,
                case when p_doc->>'type' = 'orden_pago' then (p_doc->>'party_id')::uuid else null end,
                coalesce(nullif(v_pay->>'currency',''), v_currency))
        returning id into v_cheque;
      else
        update cheques set status = 'endosado', delivered_document_id = v_id, delivered_to = (p_doc->>'party_id')::uuid
          where id = v_cheque and org_id = v_org and status = 'en_cartera';
        if not found then raise exception 'El cheque seleccionado ya no está en cartera'; end if;
      end if;
    end if;
    insert into payment_items(document_id, org_id, method, amount, cheque_id, reference, currency, fx_rate, amount_currency)
    values (v_id, v_org, v_pay->>'method', (v_pay->>'amount')::numeric, v_cheque, v_pay->>'reference',
            nullif(v_pay->>'currency',''), nullif(v_pay->>'fx_rate','')::numeric, nullif(v_pay->>'amount_currency','')::numeric);
  end loop;

  for v_app in select * from jsonb_array_elements(p_applications) loop
    if exists (select 1 from documents i where i.id = (v_app->>'invoice_document_id')::uuid and i.ledger <> v_ledger) then
      raise exception 'LEDGER: no se puede imputar un comprobante de otra cuenta (Blanco / Gestión)' using errcode = 'P0001';
    end if;
    insert into applications(org_id, payment_document_id, invoice_document_id, amount, fx_rate)
    values (v_org, v_id, (v_app->>'invoice_document_id')::uuid, (v_app->>'amount')::numeric, coalesce((v_app->>'fx_rate')::numeric, 1));
  end loop;

  for v_note in select * from jsonb_array_elements(p_fx_notes) loop
    v_note_id := public.create_document(
      (v_note->'doc') || jsonb_build_object('org_id', v_org, 'party_id', p_doc->>'party_id', 'ledger', v_ledger),
      coalesce(v_note->'lines', '[]'::jsonb));
    if v_note->'doc'->>'type' in ('nota_debito_venta','nota_debito_compra') then
      insert into applications(org_id, payment_document_id, invoice_document_id, amount, fx_rate)
      values (v_org, v_id, v_note_id, (v_note->'doc'->>'total')::numeric, 1);
    elsif nullif(v_note->>'apply_to','') is not null then
      -- Liquidación: the credit note cancels the peso balance left by the exchange rate.
      insert into applications(org_id, payment_document_id, invoice_document_id, amount, fx_rate)
      values (v_org, v_note_id, (v_note->>'apply_to')::uuid, (v_note->'doc'->>'total')::numeric, 1);
    end if;
  end loop;

  return v_id;
end $$;

-- ───────────────────────────────────────────── reject_cheque: USD cheques at the BCRA rate of the collection day
/**
 * Rejects a cheque and re-opens the debt dated on the collection day (p_date):
 *  - third-party cheque received from a customer → Nota de débito to the customer
 *    for the cheque amount (+ optional bank fees with IVA), due that same day;
 *  - cheque we delivered to a supplier → the supplier's debit note.
 * Notes go to the ledger (Blanco / Gestión) of the receipt or payment order.
 * Bank fees and exchange differences can also be billed later from
 * "Cheques → Notas por rechazos".
 */
create or replace function public.reject_cheque(p_cheque uuid, p_fee numeric default 0, p_fee_vat_rate numeric default 21,
                                                p_reason text default null, p_date date default current_date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  c cheques; o organizations; pty parties;
  v_letter text; v_fee numeric := greatest(coalesce(p_fee, 0), 0); v_fee_vat numeric; v_id uuid; v_sup uuid; v_desc text;
  v_ledger text; v_fx numeric; v_cur text;
begin
  select * into c from cheques where id = p_cheque for update;
  if not found then raise exception 'Cheque inexistente'; end if;
  if c.status not in ('en_cartera','depositado','endosado','emitido') then
    raise exception 'Un cheque % no se puede rechazar', c.status;
  end if;
  select * into o from organizations where id = c.org_id;
  v_desc := format('Cheque rechazado %s Nº %s', c.bank, c.number) || coalesce(' — ' || nullif(p_reason, ''), '');
  v_fee_vat := round(v_fee * p_fee_vat_rate / 100, 2);
  v_cur := coalesce(c.currency, o.base_currency);

  if c.received_from is not null then
    select * into pty from parties where id = c.received_from;
    select coalesce(d.ledger, 'blanco'), case when v_cur = o.base_currency then 1
                                               else coalesce((select b.rate from bcra_rates b where b.date <= p_date order by b.date desc limit 1),
                                                             case when d.currency = v_cur then d.fx_rate end, d.usd_rate) end
      into v_ledger, v_fx from documents d where d.id = c.received_document_id;
    v_ledger := coalesce(v_ledger, 'blanco');
    v_letter := case when v_ledger = 'gestion' then 'X'
                     when o.tax_condition in ('MONO','EX') then 'C' when pty.tax_condition = 'RI' then 'A' else 'B' end;
    if v_ledger = 'gestion' then v_fee_vat := 0; end if;
    v_id := public.create_document(
      jsonb_build_object('org_id', c.org_id, 'party_id', c.received_from, 'type', 'nota_debito_venta', 'letter', v_letter,
        'point_of_sale', coalesce((o.arca_config->>'pointOfSale')::int, 1), 'issue_date', p_date, 'due_date', p_date,
        'currency', v_cur, 'fx_rate', coalesce(v_fx, 1), 'net', c.amount + v_fee, 'vat', v_fee_vat, 'total', c.amount + v_fee + v_fee_vat,
        'status', 'issued', 'source_document_id', c.received_document_id, 'concept', 'cheque_rechazado', 'ledger', v_ledger,
        'meta', jsonb_build_object('chequeId', c.id, 'bank', c.bank, 'number', c.number, 'fee', v_fee, 'collectionDate', p_date), 'notes', v_desc),
      jsonb_build_array(jsonb_build_object('description', v_desc, 'quantity', 1, 'unit', 'u', 'unit_price', c.amount, 'vat_rate', 0, 'net', c.amount, 'vat', 0))
      || case when v_fee > 0 then jsonb_build_array(jsonb_build_object('description', 'Gastos bancarios por rechazo', 'quantity', 1, 'unit', 'u',
           'unit_price', v_fee, 'vat_rate', case when v_ledger = 'gestion' then 0 else p_fee_vat_rate end, 'net', v_fee, 'vat', v_fee_vat)) else '[]'::jsonb end);
  end if;

  if c.delivered_to is not null then
    select coalesce(d.ledger, 'blanco'), case when v_cur = o.base_currency then 1
                                               else coalesce((select b.rate from bcra_rates b where b.date <= p_date order by b.date desc limit 1),
                                                             case when d.currency = v_cur then d.fx_rate end, d.usd_rate) end
      into v_ledger, v_fx from documents d where d.id = c.delivered_document_id;
    v_ledger := coalesce(v_ledger, 'blanco');
    v_sup := public.create_document(
      jsonb_build_object('org_id', c.org_id, 'party_id', c.delivered_to, 'type', 'nota_debito_compra',
        'letter', case when v_ledger = 'gestion' then 'X' end,
        'issue_date', p_date, 'due_date', p_date, 'currency', v_cur, 'fx_rate', coalesce(v_fx, 1), 'net', c.amount, 'vat', 0, 'total', c.amount,
        'status', 'issued', 'source_document_id', c.delivered_document_id, 'concept', 'cheque_rechazado', 'ledger', v_ledger,
        'meta', jsonb_build_object('chequeId', c.id, 'bank', c.bank, 'number', c.number, 'collectionDate', p_date), 'notes', v_desc),
      jsonb_build_array(jsonb_build_object('description', v_desc, 'quantity', 1, 'unit', 'u', 'unit_price', c.amount, 'vat_rate', 0, 'net', c.amount, 'vat', 0)));
  end if;

  update cheques set status = 'rechazado', rejected_at = p_date, rejection_reason = p_reason,
                     rejection_document_id = v_id, supplier_debit_document_id = v_sup
   where id = p_cheque;
  return coalesce(v_id, v_sup);
end $$;
