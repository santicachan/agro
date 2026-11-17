-- CRM / facturación is a paid feature. Free organizations keep prices,
-- calculators and the marketplace (1 listing), but cannot read or write any
-- CRM table, even calling the API directly.

alter table public.plans add column if not exists crm_enabled boolean not null default true;
update public.plans set crm_enabled = false, max_listings = 1 where id = 'free';

create or replace function public.org_has_crm(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select p.crm_enabled from organizations o join plans p on p.id = o.plan_id where o.id = p_org), false);
$$;

do $$
declare t text;
begin
  foreach t in array array['parties','products','documents','document_lines','payment_items','applications','cheques','grain_swaps'] loop
    execute format('drop policy if exists "tenant read" on public.%I', t);
    execute format('drop policy if exists "tenant write" on public.%I', t);
    execute format('drop policy if exists "tenant update" on public.%I', t);
    execute format('drop policy if exists "tenant delete" on public.%I', t);
    execute format('create policy "tenant read" on public.%I for select using (public.is_member(org_id) and public.org_has_crm(org_id))', t);
    execute format('create policy "tenant write" on public.%I for insert with check (public.has_role(org_id, array[''owner'',''admin'',''member'']) and public.org_has_crm(org_id))', t);
    execute format('create policy "tenant update" on public.%I for update using (public.has_role(org_id, array[''owner'',''admin'',''member'']) and public.org_has_crm(org_id))', t);
    execute format('create policy "tenant delete" on public.%I for delete using (public.has_role(org_id, array[''owner'',''admin'']) and public.org_has_crm(org_id))', t);
  end loop;
end $$;

-- Fix: plpgsql does not short-circuit AND, so the documents branch evaluated
-- new.type on parties rows when the plan had no customer limit (pro/enterprise).
create or replace function public.enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan plans; v_count int;
begin
  select p.* into v_plan from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;
  if tg_table_name = 'parties' then
    if v_plan.max_customers is not null then
      select count(*) into v_count from parties where org_id = new.org_id;
      if v_count >= v_plan.max_customers then
        raise exception 'PLAN_LIMIT: tu plan % permite hasta % clientes/proveedores', v_plan.name, v_plan.max_customers using errcode = 'P0001';
      end if;
    end if;
  elsif tg_table_name = 'documents' then
    if v_plan.max_invoices_month is not null and new.type in ('factura_venta','nota_credito_venta','nota_debito_venta') then
      select count(*) into v_count from documents
        where org_id = new.org_id and type in ('factura_venta','nota_credito_venta','nota_debito_venta')
          and issue_date >= date_trunc('month', current_date);
      if v_count >= v_plan.max_invoices_month then
        raise exception 'PLAN_LIMIT: tu plan % permite % comprobantes por mes', v_plan.name, v_plan.max_invoices_month using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
