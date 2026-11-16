-- Atomic creation of a commercial document with its lines, payment items
-- (incl. new cheques) and applications. SECURITY INVOKER: RLS still applies.
create or replace function public.create_document(
  p_doc jsonb,
  p_lines jsonb default '[]'::jsonb,
  p_payments jsonb default '[]'::jsonb,
  p_applications jsonb default '[]'::jsonb,
  -- Debit/credit notes generated together with a payment (diferencia de cambio).
  -- Each item: { "doc": {...}, "lines": [...] }. Debit notes are created and fully
  -- applied to this payment; credit notes reduce the debt and are not applied.
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
  insert into documents(org_id, party_id, type, letter, point_of_sale, issue_date, due_date, currency, fx_rate,
                        net, vat, other_taxes, total, status, source_document_id, notes, created_by)
  values (v_org, (p_doc->>'party_id')::uuid, p_doc->>'type', nullif(p_doc->>'letter',''),
          coalesce((p_doc->>'point_of_sale')::int, 1), coalesce((p_doc->>'issue_date')::date, current_date),
          nullif(p_doc->>'due_date','')::date, coalesce(p_doc->>'currency','ARS'), coalesce((p_doc->>'fx_rate')::numeric, 1),
          coalesce((p_doc->>'net')::numeric, 0), coalesce((p_doc->>'vat')::numeric, 0), coalesce((p_doc->>'other_taxes')::numeric, 0),
          coalesce((p_doc->>'total')::numeric, 0), coalesce(p_doc->>'status','issued'),
          nullif(p_doc->>'source_document_id','')::uuid, p_doc->>'notes', auth.uid())
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
        -- New third-party cheque received (recibo) or own cheque issued (orden de pago).
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
        -- Endorse a cheque from the portfolio to a supplier.
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
      (v_note->'doc') || jsonb_build_object('org_id', v_org, 'party_id', p_doc->>'party_id', 'source_document_id', v_note->'doc'->>'source_document_id'),
      coalesce(v_note->'lines', '[]'::jsonb));
    if v_note->'doc'->>'type' in ('nota_debito_venta','nota_debito_compra') then
      insert into applications(org_id, payment_document_id, invoice_document_id, amount, fx_rate)
      values (v_org, v_id, v_note_id, (v_note->'doc'->>'total')::numeric, 1);
    end if;
  end loop;

  return v_id;
end $$;
