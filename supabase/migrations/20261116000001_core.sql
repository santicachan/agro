-- AgroJC core schema
-- Multi-tenant: every business row belongs to an organization. RLS restricts
-- access to members of that organization. Partners (white-label) own orgs.


-- ───────────────────────────────────────────────────────────── Plans & partners
create table public.plans (
  id text primary key,                         -- 'free' | 'basic' | 'pro' | 'enterprise'
  name text not null,
  price_usd_month numeric(10,2) not null default 0,
  max_customers int,                           -- null = unlimited
  max_invoices_month int,
  max_users int,
  max_listings int,
  marketplace_commission_pct numeric(5,2) not null default 8,
  features jsonb not null default '{}'::jsonb,
  sort int not null default 0
);

create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  custom_domain text unique,
  branding jsonb not null default '{}'::jsonb, -- { logoUrl, primaryColor, appName }
  revenue_share_pct numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────── Orgs & members
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tax_id text,                                 -- CUIT / CNPJ / RUT / RUC
  tax_condition text,                          -- 'RI' | 'MONO' | 'EX' ...
  region text not null default 'AR',
  base_currency text not null default 'ARS',
  plan_id text not null default 'free' references public.plans(id),
  partner_id uuid references public.partners(id),
  arca_config jsonb not null default '{}'::jsonb, -- { pointOfSale, certRef } (secrets live in Vault, never here)
  created_at timestamptz not null default now()
);

create table public.memberships (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner','admin','member','viewer')),
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  current_org_id uuid references public.organizations(id) on delete set null,
  created_at timestamptz not null default now()
);

create or replace function public.is_member(p_org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid());
$$;

create or replace function public.has_role(p_org uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.memberships m where m.org_id = p_org and m.user_id = auth.uid() and m.role = any(p_roles));
$$;

-- Create org + owner membership atomically (used on onboarding).
create or replace function public.create_organization(p_name text, p_tax_id text, p_region text default 'AR')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_org uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into organizations(name, tax_id, region, base_currency)
    values (p_name, p_tax_id, p_region, case p_region when 'BR' then 'BRL' when 'UY' then 'UYU' when 'PY' then 'PYG' else 'ARS' end)
    returning id into v_org;
  insert into memberships(org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  insert into profiles(id, current_org_id) values (auth.uid(), v_org)
    on conflict (id) do update set current_org_id = excluded.current_org_id;
  return v_org;
end $$;

-- ───────────────────────────────────────────────────────────── Subscriptions
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  plan_id text not null references public.plans(id),
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled')),
  provider text,                               -- 'mercadopago' | 'stripe'
  provider_ref text unique,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────── CRM: parties
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null check (kind in ('customer','supplier','both')),
  name text not null,
  tax_id text,
  tax_condition text,
  email text,
  phone text,
  address text,
  city text,
  province text,
  notes text,
  created_at timestamptz not null default now()
);
create index on public.parties(org_id, kind);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  sku text,
  name text not null,
  unit text not null default 'u',               -- u, kg, t, qq, L, ha
  price numeric(16,4) not null default 0,
  currency text not null default 'ARS',
  vat_rate numeric(5,2) not null default 21,
  is_grain boolean not null default false,
  crop text,
  created_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────── CRM: documents
-- One table for every commercial document so the cuenta corriente is uniform.
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null references public.parties(id),
  type text not null check (type in (
    'remito','factura_venta','nota_credito_venta','nota_debito_venta',
    'factura_compra','nota_credito_compra','nota_debito_compra',
    'recibo','orden_pago','canje')),
  letter text check (letter in ('A','B','C','M','E')),
  point_of_sale int not null default 1,
  number bigint,
  issue_date date not null default current_date,
  due_date date,
  currency text not null default 'ARS',
  fx_rate numeric(16,6) not null default 1,     -- base currency per 1 unit of `currency`
  net numeric(16,2) not null default 0,
  vat numeric(16,2) not null default 0,
  other_taxes numeric(16,2) not null default 0,
  total numeric(16,2) not null default 0,
  status text not null default 'draft' check (status in ('draft','issued','authorized','cancelled')),
  source_document_id uuid references public.documents(id), -- remito → factura, factura → ND dif. cambio
  -- ARCA (electronic invoicing)
  cae text,
  cae_due date,
  arca_response jsonb,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (org_id, type, letter, point_of_sale, number)
);
create index on public.documents(org_id, party_id, issue_date);

create table public.document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid references public.products(id),
  description text not null,
  quantity numeric(16,4) not null default 1,
  unit text not null default 'u',
  unit_price numeric(16,4) not null default 0,
  vat_rate numeric(5,2) not null default 21,
  net numeric(16,2) not null default 0,
  vat numeric(16,2) not null default 0
);

-- Payment instruments attached to receipts / payment orders.
create table public.payment_items (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  method text not null check (method in ('efectivo','transferencia','cheque','echeq','retencion','granos')),
  amount numeric(16,2) not null,
  cheque_id uuid,
  reference text
);

-- Applications of a receipt/payment against invoices (imputación).
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  payment_document_id uuid not null references public.documents(id) on delete cascade,
  invoice_document_id uuid not null references public.documents(id) on delete cascade,
  amount numeric(16,2) not null,               -- in the invoice currency
  fx_rate numeric(16,6) not null default 1     -- FX at payment, used for diferencia de cambio
);

-- Pending balance per invoice/debit note, in the document currency.
create or replace view public.open_items with (security_invoker = true) as
select d.id, d.org_id, d.party_id, d.type, d.letter, d.point_of_sale, d.number, d.issue_date, d.due_date,
       d.currency, d.fx_rate, d.total, d.vat,
       d.total - coalesce((select sum(a.amount) from public.applications a where a.invoice_document_id = d.id), 0) as pending
from public.documents d
where d.status in ('issued','authorized')
  and d.type in ('factura_venta','nota_debito_venta','factura_compra','nota_debito_compra');

-- ───────────────────────────────────────────────────────────── Cheques
create table public.cheques (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  kind text not null default 'tercero' check (kind in ('tercero','propio')),
  electronic boolean not null default false,
  bank text not null,
  number text not null,
  drawer_name text,
  drawer_tax_id text,
  amount numeric(16,2) not null,
  issue_date date,
  payment_date date not null,
  status text not null default 'en_cartera' check (status in ('en_cartera','depositado','endosado','acreditado','rechazado','emitido','debitado')),
  received_document_id uuid references public.documents(id),
  delivered_document_id uuid references public.documents(id),
  received_from uuid references public.parties(id),
  delivered_to uuid references public.parties(id),
  created_at timestamptz not null default now()
);
alter table public.payment_items add constraint payment_items_cheque_fk foreign key (cheque_id) references public.cheques(id);

-- ───────────────────────────────────────────────────────────── Canje de granos
create table public.grain_swaps (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  party_id uuid not null references public.parties(id),
  document_id uuid references public.documents(id),
  crop text not null,
  tons numeric(14,3) not null,
  price_usd_t numeric(12,2) not null,
  reference_price_source text,                  -- e.g. 'Pizarra Rosario 2026-11-13'
  delivery_from date,
  delivery_to date,
  delivered_tons numeric(14,3) not null default 0,
  status text not null default 'pendiente' check (status in ('pendiente','parcial','cumplido','anulado')),
  created_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────── Cuenta corriente
-- Signed movements: positive = party owes us (debit), negative = we owe / paid.
create or replace view public.account_movements with (security_invoker = true) as
select
  d.org_id, d.party_id, d.id as document_id, d.type, d.letter, d.point_of_sale, d.number,
  d.issue_date, d.due_date, d.currency, d.fx_rate, d.total,
  -- Amount in the organization's base currency (documents in USD use their fx_rate).
  round(d.total * d.fx_rate *
  case
    when d.type in ('factura_venta','nota_debito_venta','nota_credito_compra','orden_pago') then 1
    when d.type in ('nota_credito_venta','recibo','factura_compra','nota_debito_compra') then -1
    else 0
  end, 2) as amount
from public.documents d
where d.status <> 'cancelled' and d.status <> 'draft';

-- ───────────────────────────────────────────────────────────── Prices
create table public.price_snapshots (
  key text not null,
  as_of date not null,
  market text not null,
  crop text not null,
  label text not null,
  price numeric(16,4) not null,
  currency text not null,
  unit text not null,
  usd_per_ton numeric(12,2),
  estimated boolean not null default false,
  source text not null,
  source_url text not null,
  captured_at timestamptz not null default now(),
  primary key (key, as_of)
);

create table public.fx_snapshots (
  pair text not null,
  as_of date not null,
  buy numeric(16,6) not null,
  sell numeric(16,6) not null,
  source text not null,
  primary key (pair, as_of)
);

-- Org-specific price alerts (Pro feature).
create table public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null,
  condition text not null check (condition in ('above','below')),
  threshold_usd_t numeric(12,2) not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────── RLS
alter table public.plans enable row level security;
alter table public.partners enable row level security;
alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.parties enable row level security;
alter table public.products enable row level security;
alter table public.documents enable row level security;
alter table public.document_lines enable row level security;
alter table public.payment_items enable row level security;
alter table public.applications enable row level security;
alter table public.cheques enable row level security;
alter table public.grain_swaps enable row level security;
alter table public.price_snapshots enable row level security;
alter table public.fx_snapshots enable row level security;
alter table public.price_alerts enable row level security;

create policy "plans readable" on public.plans for select using (true);
create policy "partners readable" on public.partners for select using (true);
create policy "prices readable" on public.price_snapshots for select using (true);
create policy "fx readable" on public.fx_snapshots for select using (true);

create policy "org members read" on public.organizations for select using (public.is_member(id));
create policy "org admins update" on public.organizations for update using (public.has_role(id, array['owner','admin']));

create policy "own memberships" on public.memberships for select using (user_id = auth.uid() or public.has_role(org_id, array['owner','admin']));
create policy "admins manage memberships" on public.memberships for all using (public.has_role(org_id, array['owner','admin']));

create policy "own profile" on public.profiles for all using (id = auth.uid()) with check (id = auth.uid());

create policy "members read subs" on public.subscriptions for select using (public.is_member(org_id));

-- Generic tenant policies for business tables.
do $$
declare t text;
begin
  foreach t in array array['parties','products','documents','document_lines','payment_items','applications','cheques','grain_swaps','price_alerts'] loop
    execute format('create policy "tenant read" on public.%I for select using (public.is_member(org_id))', t);
    execute format('create policy "tenant write" on public.%I for insert with check (public.has_role(org_id, array[''owner'',''admin'',''member'']))', t);
    execute format('create policy "tenant update" on public.%I for update using (public.has_role(org_id, array[''owner'',''admin'',''member'']))', t);
    execute format('create policy "tenant delete" on public.%I for delete using (public.has_role(org_id, array[''owner'',''admin'']))', t);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────── Freemium limits
-- Enforced in the database so they cannot be bypassed from the client.
create or replace function public.enforce_plan_limits() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_plan plans; v_count int;
begin
  select p.* into v_plan from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;
  if tg_table_name = 'parties' and v_plan.max_customers is not null then
    select count(*) into v_count from parties where org_id = new.org_id;
    if v_count >= v_plan.max_customers then
      raise exception 'PLAN_LIMIT: tu plan % permite hasta % clientes/proveedores', v_plan.name, v_plan.max_customers using errcode = 'P0001';
    end if;
  elsif tg_table_name = 'documents' and v_plan.max_invoices_month is not null
        and new.type in ('factura_venta','nota_credito_venta','nota_debito_venta') then
    select count(*) into v_count from documents
      where org_id = new.org_id and type in ('factura_venta','nota_credito_venta','nota_debito_venta')
        and issue_date >= date_trunc('month', current_date);
    if v_count >= v_plan.max_invoices_month then
      raise exception 'PLAN_LIMIT: tu plan % permite % comprobantes por mes', v_plan.name, v_plan.max_invoices_month using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;

create trigger parties_plan_limit before insert on public.parties for each row execute function public.enforce_plan_limits();
create trigger documents_plan_limit before insert on public.documents for each row execute function public.enforce_plan_limits();

-- Sequential numbering per (org, type, letter, point of sale).
create or replace function public.assign_document_number() returns trigger
language plpgsql as $$
begin
  if new.number is null then
    perform pg_advisory_xact_lock(hashtext(new.org_id::text || new.type || coalesce(new.letter,'') || new.point_of_sale::text));
    select coalesce(max(number), 0) + 1 into new.number from documents
      where org_id = new.org_id and type = new.type and coalesce(letter,'') = coalesce(new.letter,'') and point_of_sale = new.point_of_sale;
  end if;
  return new;
end $$;
create trigger documents_number before insert on public.documents for each row execute function public.assign_document_number();
