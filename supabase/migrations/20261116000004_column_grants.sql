-- Column-level privileges: billing-controlled fields can only be changed by the
-- service role (webhooks), never by end users through the API.

-- organizations.plan_id / partner_id are managed by billing webhooks.
revoke update on public.organizations from authenticated, anon;
grant update (name, tax_id, tax_condition, region, base_currency, arca_config) on public.organizations to authenticated;

-- listings.featured_until is paid placement; views is a counter.
revoke update on public.listings from authenticated, anon;
grant update (category_slug, title, description, price, currency, unit, condition, brand, model, year, province, city, images, status)
  on public.listings to authenticated;

-- Buyers create orders; commission is set by trigger from the seller's plan.
create policy "buyers create orders" on public.marketplace_orders for insert with check (buyer_user_id = auth.uid());

-- Atomic view counter callable by anyone for active listings.
create or replace function public.increment_listing_views(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update listings set views = views + 1 where id = p_id and status = 'active';
$$;
grant execute on function public.increment_listing_views(uuid) to anon, authenticated;
