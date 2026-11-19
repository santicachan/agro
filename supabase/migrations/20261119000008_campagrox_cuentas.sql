-- CAMPAGROX: cuentas corrientes Blanco / Gestión (Facturas X), cuentas en pesos y
-- dólares, canjes con camioneta e insumos, medios de pago Insumo / Vehículo.
-- Additive only: new columns have defaults, so every existing row stays in Blanco
-- and keeps its numbers. Check constraints are only widened.

-- ───────────────────────────────────────────── Documents: ledger + USD reference rate
alter table public.documents add column if not exists ledger text not null default 'blanco';
alter table public.documents add column if not exists usd_rate numeric(16,6); -- base currency per USD on the issue day
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_ledger_check' and conrelid = 'public.documents'::regclass) then
    alter table public.documents add constraint documents_ledger_check check (ledger in ('blanco','gestion'));
  end if;
end $$;
create index if not exists documents_ledger_idx on public.documents(org_id, ledger, party_id, issue_date);

-- Facturas X: internal documents of the Gestión ledger. Letter X never exists in
-- Blanco and Gestión never uses fiscal letters, so nothing informal can reach ARCA
-- or the libros.
alter table public.documents drop constraint if exists documents_letter_check;
alter table public.documents add constraint documents_letter_check check (letter in ('A','B','C','M','E','X'));
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_letter_ledger_check' and conrelid = 'public.documents'::regclass) then
    alter table public.documents add constraint documents_letter_ledger_check
      check ((letter is distinct from 'X' or ledger = 'gestion') and (ledger = 'blanco' or letter is null or letter = 'X'));
  end if;
end $$;

-- Gestión documents can never get a CAE.
create or replace function public.protect_gestion_documents() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.ledger = 'gestion' and (new.status = 'authorized' or new.cae is not null) then
    raise exception 'GESTION: los comprobantes de Gestión (Factura X) son internos y no se autorizan en ARCA.' using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists documents_gestion_guard on public.documents;
create trigger documents_gestion_guard before insert or update on public.documents
  for each row execute function public.protect_gestion_documents();

-- ───────────────────────────────────────────── Payment methods: insumo / vehículo
alter table public.payment_items drop constraint if exists payment_items_method_check;
alter table public.payment_items add constraint payment_items_method_check
  check (method in ('efectivo','transferencia','cheque','echeq','retencion','granos','insumo','vehiculo'));

-- ───────────────────────────────────────────── Cheques: currency (ARS / USD)
alter table public.cheques add column if not exists currency text not null default 'ARS';

-- ───────────────────────────────────────────── Canjes: granos, camioneta o insumos
alter table public.grain_swaps add column if not exists kind text not null default 'granos';
alter table public.grain_swaps add column if not exists description text;
alter table public.grain_swaps add column if not exists unit text not null default 't';
alter table public.grain_swaps alter column crop drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'grain_swaps_kind_check' and conrelid = 'public.grain_swaps'::regclass) then
    alter table public.grain_swaps add constraint grain_swaps_kind_check check (kind in ('granos','camioneta','insumos'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'grain_swaps_crop_required' and conrelid = 'public.grain_swaps'::regclass) then
    alter table public.grain_swaps add constraint grain_swaps_crop_required check (kind <> 'granos' or crop is not null);
  end if;
end $$;

-- ───────────────────────────────────────────── Views (new columns go last)
create or replace view public.open_items with (security_invoker = true) as
select d.id, d.org_id, d.party_id, d.type, d.letter, d.point_of_sale, d.number, d.issue_date, d.due_date,
       d.currency, d.fx_rate, d.total, d.vat,
       d.total - coalesce((select sum(a.amount) from public.applications a where a.invoice_document_id = d.id), 0) as pending,
       d.ledger
from public.documents d
where d.status in ('issued','authorized')
  and d.type in ('factura_venta','nota_debito_venta','factura_compra','nota_debito_compra');

create or replace view public.document_balances with (security_invoker = true) as
select d.id, d.org_id, d.party_id, d.type, d.currency, d.total,
  case
    when d.type in ('factura_venta','nota_debito_venta','factura_compra','nota_debito_compra') then
      round(d.total - coalesce((select sum(a.amount) from public.applications a where a.invoice_document_id = d.id), 0), 2)
    when d.type in ('recibo','orden_pago','nota_credito_venta','nota_credito_compra') and d.concept is null then
      round(d.total - coalesce((select sum(a.amount * a.fx_rate) from public.applications a
                                 join public.documents i on i.id = a.invoice_document_id
                                where a.payment_document_id = d.id and i.concept is distinct from 'diferencia_cambio'), 0), 2)
    else 0
  end as pending,
  d.ledger
from public.documents d
where d.status in ('issued','authorized');

create or replace view public.account_movements with (security_invoker = true) as
select
  d.org_id, d.party_id, d.id as document_id, d.type, d.letter, d.point_of_sale, d.number,
  d.issue_date, d.due_date, d.currency, d.fx_rate, d.total,
  round(d.total * d.fx_rate *
  case
    when d.type in ('factura_venta','nota_debito_venta','nota_credito_compra','orden_pago') then 1
    when d.type in ('nota_credito_venta','recibo','factura_compra','nota_debito_compra') then -1
    else 0
  end, 2) as amount,
  d.concept, d.source_document_id, d.status, d.cae, d.created_at,
  d.ledger, d.usd_rate
from public.documents d
where d.status <> 'cancelled' and d.status <> 'draft';

-- ───────────────────────────────────────────── create_document: ledger, USD rate, cheque currency
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
begin
  insert into documents(org_id, party_id, type, letter, point_of_sale, number, issue_date, due_date, currency, fx_rate,
                        net, vat, other_taxes, total, status, source_document_id, notes, created_by, concept, meta, ledger, usd_rate)
  values (v_org, (p_doc->>'party_id')::uuid, p_doc->>'type', nullif(p_doc->>'letter',''),
          coalesce((p_doc->>'point_of_sale')::int, 1), nullif(p_doc->>'number','')::bigint, coalesce((p_doc->>'issue_date')::date, current_date),
          nullif(p_doc->>'due_date','')::date, v_currency, coalesce((p_doc->>'fx_rate')::numeric, 1),
          coalesce((p_doc->>'net')::numeric, 0), coalesce((p_doc->>'vat')::numeric, 0), coalesce((p_doc->>'other_taxes')::numeric, 0),
          coalesce((p_doc->>'total')::numeric, 0), coalesce(p_doc->>'status','issued'),
          nullif(p_doc->>'source_document_id','')::uuid, p_doc->>'notes', auth.uid(),
          nullif(p_doc->>'concept',''), coalesce(p_doc->'meta', '{}'::jsonb), v_ledger,
          coalesce(nullif(p_doc->>'usd_rate','')::numeric, case when v_currency = 'USD' then (p_doc->>'fx_rate')::numeric end))
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
                v_pay->'cheque'->>'drawer_name', v_pay->'cheque'->>'drawer_tax_id', (v_pay->>'amount')::numeric,
                nullif(v_pay->'cheque'->>'issue_date','')::date, (v_pay->'cheque'->>'payment_date')::date,
                case when p_doc->>'type' = 'orden_pago' then 'emitido' else 'en_cartera' end,
                case when p_doc->>'type' = 'orden_pago' then null else v_id end,
                case when p_doc->>'type' = 'orden_pago' then null else (p_doc->>'party_id')::uuid end,
                case when p_doc->>'type' = 'orden_pago' then v_id else null end,
                case when p_doc->>'type' = 'orden_pago' then (p_doc->>'party_id')::uuid else null end,
                v_currency)
        returning id into v_cheque;
      else
        update cheques set status = 'endosado', delivered_document_id = v_id, delivered_to = (p_doc->>'party_id')::uuid
          where id = v_cheque and org_id = v_org and status = 'en_cartera';
        if not found then raise exception 'El cheque seleccionado ya no está en cartera'; end if;
      end if;
    end if;
    insert into payment_items(document_id, org_id, method, amount, cheque_id, reference)
    values (v_id, v_org, v_pay->>'method', (v_pay->>'amount')::numeric, v_cheque, v_pay->>'reference');
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
    end if;
  end loop;

  return v_id;
end $$;

-- ───────────────────────────────────────────── reject_cheque: ledger + debt dated at the collection day
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
    select coalesce(d.ledger, 'blanco'), case when v_cur = o.base_currency then 1 else d.fx_rate end
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
    select coalesce(d.ledger, 'blanco'), case when v_cur = o.base_currency then 1 else d.fx_rate end
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
