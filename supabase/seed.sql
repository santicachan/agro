-- Plans (keep in sync with src/lib/billing/plans.ts)
insert into public.plans (id, name, price_usd_month, max_customers, max_invoices_month, max_users, max_listings, marketplace_commission_pct, sort) values
  ('free',       'Gratis',     0,   25,   20,   1,    3, 8, 0),
  ('basic',      'Basic',      19,  250,  200,  3,   15, 6, 1),
  ('pro',        'Pro',        49,  null, 2000, 10,  60, 4, 2),
  ('enterprise', 'Enterprise', 199, null, null, null, null, 3, 3)
on conflict (id) do update set
  name = excluded.name, price_usd_month = excluded.price_usd_month, max_customers = excluded.max_customers,
  max_invoices_month = excluded.max_invoices_month, max_users = excluded.max_users, max_listings = excluded.max_listings,
  marketplace_commission_pct = excluded.marketplace_commission_pct, sort = excluded.sort;

insert into public.listing_categories (slug, name, parent_slug, sort) values
  ('agroquimicos', 'Agroquímicos', null, 1),
  ('agroquimicos-herbicidas', 'Herbicidas', 'agroquimicos', 1),
  ('agroquimicos-insecticidas', 'Insecticidas', 'agroquimicos', 2),
  ('agroquimicos-fungicidas', 'Fungicidas', 'agroquimicos', 3),
  ('insumos', 'Insumos', null, 2),
  ('insumos-semillas', 'Semillas', 'insumos', 1),
  ('insumos-fertilizantes', 'Fertilizantes', 'insumos', 2),
  ('insumos-silobolsas', 'Silobolsas y almacenaje', 'insumos', 3),
  ('maquinarias', 'Maquinarias', null, 3),
  ('maquinarias-tractores', 'Tractores', 'maquinarias', 1),
  ('maquinarias-cosechadoras', 'Cosechadoras', 'maquinarias', 2),
  ('maquinarias-sembradoras', 'Sembradoras', 'maquinarias', 3),
  ('maquinarias-pulverizadoras', 'Pulverizadoras', 'maquinarias', 4),
  ('servicios', 'Servicios', null, 4)
on conflict (slug) do nothing;
