-- Marketplace: agroquímicos, insumos, maquinarias.

create table public.listing_categories (
  slug text primary key,
  name text not null,
  parent_slug text references public.listing_categories(slug),
  sort int not null default 0
);

create table public.seller_verifications (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  tax_id text not null,
  -- Agroquímicos require registered seller (e.g. SENASA / provincial registry).
  agrochem_license text,
  documents jsonb not null default '[]'::jsonb, -- storage paths
  reviewed_at timestamptz,
  notes text
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  category_slug text not null references public.listing_categories(slug),
  title text not null,
  slug text not null unique,
  description text not null default '',
  price numeric(16,2),
  currency text not null default 'USD',
  unit text,
  condition text check (condition in ('nuevo','usado','reacondicionado')),
  brand text,
  model text,
  year int,
  province text,
  city text,
  region text not null default 'AR',
  images text[] not null default '{}',
  status text not null default 'active' check (status in ('draft','active','paused','sold','removed')),
  featured_until timestamptz,
  views int not null default 0,
  created_at timestamptz not null default now()
);
create index on public.listings(status, category_slug, created_at desc);
create index on public.listings(featured_until desc nulls last);

-- Paid featured placements.
create table public.listing_boosts (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  days int not null,
  amount_usd numeric(10,2) not null,
  provider_ref text,
  status text not null default 'pending' check (status in ('pending','paid','failed')),
  created_at timestamptz not null default now()
);

-- Orders with commission captured at sale time (commission % from seller plan).
create table public.marketplace_orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id),
  seller_org_id uuid not null references public.organizations(id),
  buyer_user_id uuid not null references auth.users(id),
  quantity numeric(14,3) not null default 1,
  amount numeric(16,2) not null,
  currency text not null,
  commission_pct numeric(5,2) not null,
  commission_amount numeric(16,2) not null,
  status text not null default 'pending' check (status in ('pending','paid','shipped','completed','cancelled','disputed')),
  created_at timestamptz not null default now()
);

create table public.listing_inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.listing_categories enable row level security;
alter table public.seller_verifications enable row level security;
alter table public.listings enable row level security;
alter table public.listing_boosts enable row level security;
alter table public.marketplace_orders enable row level security;
alter table public.listing_inquiries enable row level security;

create policy "categories public" on public.listing_categories for select using (true);
create policy "active listings public" on public.listings for select using (status = 'active' or public.is_member(org_id));
create policy "sellers insert" on public.listings for insert with check (public.has_role(org_id, array['owner','admin','member']));
create policy "sellers update" on public.listings for update using (public.has_role(org_id, array['owner','admin','member']));
create policy "verification own" on public.seller_verifications for select using (public.is_member(org_id));
create policy "verification request" on public.seller_verifications for insert with check (public.has_role(org_id, array['owner','admin']) and status = 'pending');
create policy "boosts own" on public.listing_boosts for select using (public.is_member(org_id));
create policy "orders parties" on public.marketplace_orders for select using (buyer_user_id = auth.uid() or public.is_member(seller_org_id));
create policy "inquiries anyone insert" on public.listing_inquiries for insert with check (true);
create policy "inquiries seller read" on public.listing_inquiries for select using (
  exists (select 1 from public.listings l where l.id = listing_id and public.is_member(l.org_id)));

-- Listing limit per plan.
create or replace function public.enforce_listing_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_max int; v_count int;
begin
  select p.max_listings into v_max from organizations o join plans p on p.id = o.plan_id where o.id = new.org_id;
  if v_max is not null then
    select count(*) into v_count from listings where org_id = new.org_id and status in ('active','paused','draft');
    if v_count >= v_max then
      raise exception 'PLAN_LIMIT: tu plan permite % publicaciones activas', v_max using errcode = 'P0001';
    end if;
  end if;
  -- Agroquímicos only from verified sellers.
  if new.category_slug like 'agroquimicos%' and not exists (
      select 1 from seller_verifications v where v.org_id = new.org_id and v.status = 'verified') then
    raise exception 'VERIFICATION_REQUIRED: para publicar agroquímicos tenés que ser vendedor verificado' using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger listings_limit before insert on public.listings for each row execute function public.enforce_listing_limit();

-- Commission is computed server-side from the seller plan, never trusted from client.
create or replace function public.set_order_commission() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  select p.marketplace_commission_pct into new.commission_pct
    from organizations o join plans p on p.id = o.plan_id where o.id = new.seller_org_id;
  new.commission_amount := round(new.amount * new.commission_pct / 100, 2);
  return new;
end $$;
create trigger orders_commission before insert on public.marketplace_orders for each row execute function public.set_order_commission();
