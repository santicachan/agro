-- CRM pro: traceable concepts, ARCA lock, rejected cheques, balances per document.

-- ───────────────────────────────────────────── Documents: concept + metadata
alter table public.documents add column if not exists concept text
  check (concept in ('diferencia_cambio','cheque_rechazado'));
alter table public.documents add column if not exists meta jsonb not null default '{}'::jsonb;
create index if not exists documents_source_idx on public.documents(source_document_id);
create index if not exists documents_period_idx on public.documents(org_id, issue_date, type);

-- Purchase documents carry the supplier's own point of sale and number, so two
-- suppliers can share a number: uniqueness includes the party for purchases.
alter table public.documents drop constraint if exists documents_org_id_type_letter_point_of_sale_number_key;
create unique index if not exists documents_number_uniq on public.documents (
  org_id, type, coalesce(letter, ''), point_of_sale, number,
  coalesce(case when type in ('factura_compra','nota_credito_compra','nota_debito_compra') then party_id end, '00000000-0000-0000-0000-000000000000'::uuid)
);

-- create_document now stores concept + meta (same signature, so callers are unchanged).
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
  v_line jsonb;
  v_pay jsonb;
  v_app jsonb;
  v_cheque uuid;
  v_note jsonb;
  v_note_id uuid;
begin
  insert into documents(org_id, party_id, type, letter, point_of_sale, number, issue_date, due_date, currency, fx_rate,
                        net, vat, other_taxes, total, status, source_document_id, notes, created_by, concept, meta)
  values (v_org, (p_doc->>'party_id')::uuid, p_doc->>'type', nullif(p_doc->>'letter',''),
          coalesce((p_doc->>'point_of_sale')::int, 1), nullif(p_doc->>'number','')::bigint, coalesce((p_doc->>'issue_date')::date, current_date),
          nullif(p_doc->>'due_date','')::date, coalesce(p_doc->>'currency','ARS'), coalesce((p_doc->>'fx_rate')::numeric, 1),
          coalesce((p_doc->>'net')::numeric, 0), coalesce((p_doc->>'vat')::numeric, 0), coalesce((p_doc->>'other_taxes')::numeric, 0),
          coalesce((p_doc->>'total')::numeric, 0), coalesce(p_doc->>'status','issued'),
          nullif(p_doc->>'source_document_id','')::uuid, p_doc->>'notes', auth.uid(),
          nullif(p_doc->>'concept',''), coalesce(p_doc->'meta', '{}'::jsonb))
  returning id into v_id;

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
                            received_document_id, received_from, delivered_document_id, delivered_to)
        values (v_org,
                case when p_doc->>'type' = 'orden_pago' then 'propio' else 'tercero' end,
                v_pay->>'method' = 'echeq', v_pay->'cheque'->>'bank', v_pay->'cheque'->>'number',
                v_pay->'cheque'->>'drawer_name', v_pay->'cheque'->>'drawer_tax_id', (v_pay->>'amount')::numeric,
                nullif(v_pay->'cheque'->>'issue_date','')::date, (v_pay->'cheque'->>'payment_date')::date,
                case when p_doc->>'type' = 'orden_pago' then 'emitido' else 'en_cartera' end,
                case when p_doc->>'type' = 'orden_pago' then null else v_id end,
                case when p_doc->>'type' = 'orden_pago' then null else (p_doc->>'party_id')::uuid end,
                case when p_doc->>'type' = 'orden_pago' then v_id else null end,
                case when p_doc->>'type' = 'orden_pago' then (p_doc->>'party_id')::uuid else null end)
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
    insert into applications(org_id, payment_document_id, invoice_document_id, amount, fx_rate)
    values (v_org, v_id, (v_app->>'invoice_document_id')::uuid, (v_app->>'amount')::numeric, coalesce((v_app->>'fx_rate')::numeric, 1));
  end loop;

  for v_note in select * from jsonb_array_elements(p_fx_notes) loop
    v_note_id := public.create_document(
      (v_note->'doc') || jsonb_build_object('org_id', v_org, 'party_id', p_doc->>'party_id'),
      coalesce(v_note->'lines', '[]'::jsonb));
    if v_note->'doc'->>'type' in ('nota_debito_venta','nota_debito_compra') then
      insert into applications(org_id, payment_document_id, invoice_document_id, amount, fx_rate)
      values (v_org, v_id, v_note_id, (v_note->'doc'->>'total')::numeric, 1);
    end if;
  end loop;

  return v_id;
end $$;

-- ───────────────────────────────────────────── ARCA: authorized documents are immutable
create or replace function public.protect_authorized_documents() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'authorized' then
    raise exception 'LOCKED: el comprobante tiene CAE % y no se puede modificar ni borrar. Para corregirlo emití una nota de crédito.', old.cae
      using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists documents_lock on public.documents;
create trigger documents_lock before update or delete on public.documents
  for each row execute function public.protect_authorized_documents();

create or replace function public.protect_authorized_lines() returns trigger
language plpgsql set search_path = public as $$
declare v_status text;
begin
  select status into v_status from documents where id = coalesce(new.document_id, old.document_id);
  if v_status = 'authorized' then
    raise exception 'LOCKED: el comprobante tiene CAE y sus renglones no se pueden modificar.' using errcode = 'P0001';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
drop trigger if exists document_lines_lock on public.document_lines;
create trigger document_lines_lock before insert or update or delete on public.document_lines
  for each row execute function public.protect_authorized_lines();

-- ───────────────────────────────────────────── Cheques: tracking + rejection
alter table public.cheques add column if not exists deposited_at date;
alter table public.cheques add column if not exists credited_at date;
alter table public.cheques add column if not exists rejected_at date;
alter table public.cheques add column if not exists rejection_reason text;
alter table public.cheques add column if not exists rejection_document_id uuid references public.documents(id);
alter table public.cheques add column if not exists supplier_debit_document_id uuid references public.documents(id);

/**
 * Rejects a cheque and books the automatic charges, atomically:
 *  - third-party cheque received from a customer → Nota de débito to the customer
 *    for the cheque amount (no IVA) + bank fees (with IVA);
 *  - cheque we delivered to a supplier (endorsed or own) → the supplier's debit
 *    note for the cheque amount, so we owe it again.
 */
create or replace function public.reject_cheque(p_cheque uuid, p_fee numeric default 0, p_fee_vat_rate numeric default 21,
                                                p_reason text default null, p_date date default current_date)
returns uuid language plpgsql security invoker set search_path = public as $$
declare
  c cheques; o organizations; pty parties;
  v_letter text; v_fee numeric := greatest(coalesce(p_fee, 0), 0); v_fee_vat numeric; v_id uuid; v_sup uuid; v_desc text;
begin
  select * into c from cheques where id = p_cheque for update;
  if not found then raise exception 'Cheque inexistente'; end if;
  if c.status not in ('en_cartera','depositado','endosado','emitido') then
    raise exception 'Un cheque % no se puede rechazar', c.status;
  end if;
  select * into o from organizations where id = c.org_id;
  v_desc := format('Cheque rechazado %s Nº %s', c.bank, c.number) || coalesce(' — ' || nullif(p_reason, ''), '');
  v_fee_vat := round(v_fee * p_fee_vat_rate / 100, 2);

  if c.received_from is not null then
    select * into pty from parties where id = c.received_from;
    v_letter := case when o.tax_condition in ('MONO','EX') then 'C' when pty.tax_condition = 'RI' then 'A' else 'B' end;
    v_id := public.create_document(
      jsonb_build_object('org_id', c.org_id, 'party_id', c.received_from, 'type', 'nota_debito_venta', 'letter', v_letter,
        'point_of_sale', coalesce((o.arca_config->>'pointOfSale')::int, 1), 'issue_date', p_date,
        'currency', o.base_currency, 'fx_rate', 1, 'net', c.amount + v_fee, 'vat', v_fee_vat, 'total', c.amount + v_fee + v_fee_vat,
        'status', 'issued', 'source_document_id', c.received_document_id, 'concept', 'cheque_rechazado',
        'meta', jsonb_build_object('chequeId', c.id, 'bank', c.bank, 'number', c.number, 'fee', v_fee), 'notes', v_desc),
      jsonb_build_array(jsonb_build_object('description', v_desc, 'quantity', 1, 'unit', 'u', 'unit_price', c.amount, 'vat_rate', 0, 'net', c.amount, 'vat', 0))
      || case when v_fee > 0 then jsonb_build_array(jsonb_build_object('description', 'Gastos bancarios por rechazo', 'quantity', 1, 'unit', 'u',
           'unit_price', v_fee, 'vat_rate', p_fee_vat_rate, 'net', v_fee, 'vat', v_fee_vat)) else '[]'::jsonb end);
  end if;

  if c.delivered_to is not null then
    v_sup := public.create_document(
      jsonb_build_object('org_id', c.org_id, 'party_id', c.delivered_to, 'type', 'nota_debito_compra',
        'issue_date', p_date, 'currency', o.base_currency, 'fx_rate', 1, 'net', c.amount, 'vat', 0, 'total', c.amount,
        'status', 'issued', 'source_document_id', c.delivered_document_id, 'concept', 'cheque_rechazado',
        'meta', jsonb_build_object('chequeId', c.id, 'bank', c.bank, 'number', c.number), 'notes', v_desc),
      jsonb_build_array(jsonb_build_object('description', v_desc, 'quantity', 1, 'unit', 'u', 'unit_price', c.amount, 'vat_rate', 0, 'net', c.amount, 'vat', 0)));
  end if;

  update cheques set status = 'rechazado', rejected_at = p_date, rejection_reason = p_reason,
                     rejection_document_id = v_id, supplier_debit_document_id = v_sup
   where id = p_cheque;
  return coalesce(v_id, v_sup);
end $$;

-- ───────────────────────────────────────────── Balances per document
-- pending: debt still open (invoices / debit notes) or amount not yet applied
-- (receipts, payment orders, credit notes), in the document's own currency.
create or replace view public.document_balances with (security_invoker = true) as
select d.id, d.org_id, d.party_id, d.type, d.currency, d.total,
  case
    when d.type in ('factura_venta','nota_debito_venta','factura_compra','nota_debito_compra') then
      round(d.total - coalesce((select sum(a.amount) from public.applications a where a.invoice_document_id = d.id), 0), 2)
    when d.type in ('recibo','orden_pago','nota_credito_venta','nota_credito_compra') and d.concept is null then
      -- Foreign invoices are valued at the payment rate, which already includes the
      -- exchange difference; the auto-applied difference note must not count twice.
      round(d.total - coalesce((select sum(a.amount * a.fx_rate) from public.applications a
                                 join public.documents i on i.id = a.invoice_document_id
                                where a.payment_document_id = d.id and i.concept is distinct from 'diferencia_cambio'), 0), 2)
    else 0
  end as pending
from public.documents d
where d.status in ('issued','authorized');

-- Cuenta corriente: add concept/links (new columns go last to keep the view compatible).
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
  d.concept, d.source_document_id, d.status, d.cae, d.created_at
from public.documents d
where d.status <> 'cancelled' and d.status <> 'draft';
