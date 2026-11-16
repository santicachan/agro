# AgroJC

Plataforma agro todo-en-uno: **precios de granos en tiempo real**, **calculadoras agronómicas**, **gestión comercial / facturación** (CRM-ERP liviano estilo Finnegans) y **marketplace** de agroquímicos, insumos y maquinaria. Pensada mobile-first para gente del campo y preparada para escalar de Argentina a Brasil y el resto de LatAm.

**Stack:** Next.js 15 (App Router, RSC, Server Actions) · Tailwind v4 + componentes estilo shadcn/ui · Supabase (Auth, Postgres + RLS, Storage) · Vercel (ISR + Cron) · Vitest.

---

## Módulos

| Módulo | Rutas | Estado |
|---|---|---|
| Precios | `/precios`, `/precios/[grano]` | Datos en vivo: pizarra BCR Rosario, CBOT/CME (vía Yahoo), CEPEA Brasil, dólar mayorista y BRL. ISR 15 min + snapshots diarios |
| Calculadoras | `/calculadoras`, `/calculadoras/[slug]` | 8 calculadoras: margen bruto, densidad de siembra, merma por humedad, costo/ha, NPK, pulverización, precio en chacra, conversor qq/t/saca/bushel |
| CRM / Facturación | `/app/*` | Clientes, proveedores, cuenta corriente, remito → factura, facturas de compra, recibos, órdenes de pago, cheques en cartera (recibir/endosar/depositar), canje de granos, diferencia de cambio con ND/NC automática |
| ARCA | `src/lib/crm/arca.ts` | Payload `FECAESolicitar` completo y testeado; transporte SOAP/WSAA enchufable (ver pendientes) |
| Marketplace | `/marketplace/*`, `/app/publicaciones` | Catálogo SEO, búsqueda, consultas, pedidos con comisión, verificación de vendedores, destacados pagos, fotos en Storage |
| Monetización | `/planes`, `/app/plan` | Freemium con límites **en la base de datos**, planes Basic/Pro/Enterprise, comisión 3–8 %, destacados, Mercado Pago (suscripción + checkout) |
| SEO | `sitemap.xml`, `robots.txt`, JSON-LD | Metadatos + canonical, Breadcrumb/FAQ/Product/Article/SoftwareApplication schema, blog técnico |
| White-label | `/partners`, env `NEXT_PUBLIC_BRAND_*` | Un deploy por partner con su dominio, nombre y color; tabla `partners` para revenue share |

## Arquitectura

```
src/
  app/
    (public)/          Páginas públicas SEO (ISR): home, precios, calculadoras, marketplace, blog, planes
    app/(org)/         App privada (requiere sesión + organización): dashboard, CRM, cheques, canjes, plan
    app/onboarding     Alta de empresa (RPC create_organization)
    api/cron/prices    Snapshot diario de precios (Vercel Cron)
    api/webhooks/      Mercado Pago (firma HMAC verificada, re-consulta la API)
  lib/
    regions.ts         Config por país (moneda, CUIT/CNPJ, autoridad de facturación, IVA, unidad)
    units.ts           Conversiones kg/qq/t/saca/bushel por grano
    calculators/       Fórmulas puras + registro declarativo (UI y SEO salen del mismo registro)
    prices/            Fuentes (parsers con fixtures reales) + agregador tolerante a fallas
    crm/               Dominio puro (totales, letras, saldo, dif. de cambio, canje), ARCA, acciones y queries
    billing/           Planes, Mercado Pago, acciones de checkout
    marketplace/       Categorías, queries y acciones
  content/blog.ts      Posts tipados (sin dependencia MDX)
supabase/
  migrations/          Esquema multi-tenant con RLS, triggers de límites, RPC transaccional, grants por columna, storage
  seed.sql             Planes y categorías
```

**Decisiones clave**

- **Multi-tenant por `org_id` + RLS** en todas las tablas de negocio. Funciones `is_member()` / `has_role()` (owner/admin/member/viewer).
- **Límites freemium en triggers de Postgres** (`PLAN_LIMIT: …`), no en el frontend → no se pueden saltear vía API. `plan_id`, `partner_id` y `featured_until` solo los cambia el service role (grants por columna).
- **Una sola tabla `documents`** para todos los comprobantes → la cuenta corriente es una vista (`account_movements`) en moneda base, y `open_items` calcula pendientes por comprobante en su moneda.
- **`create_document` RPC** graba comprobante + renglones + medios de pago + cheques + imputaciones + ND/NC de diferencia de cambio **en una sola transacción**.
- **Precios honestos:** cada fuente puede fallar sin romper la página; se muestra qué fuente falló, se marca "Estimado" cuando la BCR publica S/C (E), y "Último guardado" cuando se usa el snapshot. Nunca se inventan precios.
- **Regionalización:** todo lo específico de país vive en `regions.ts` (moneda, IVA, identificador fiscal, proveedor de e-invoicing). Brasil/Uruguay/Paraguay ya tienen config; falta su adaptador fiscal.
- **UX de campo:** botones e inputs de 48 px, barra inferior en el celular, resultados de calculadoras en vivo, accesos rápidos (Facturar / Cobrar / Pagar).

## Correr localmente

```bash
npm install
cp .env.example .env.local   # opcional: sin Supabase funcionan precios, calculadoras y blog
npm run dev
```

Con Supabase:

```bash
supabase link --project-ref <ref>
supabase db push            # aplica supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql
```

Scripts: `npm test` (Vitest, 29 tests), `npm run typecheck`, `npm run lint`, `npm run build`.

## Deploy (Vercel)

1. Importar el repo en Vercel y cargar las variables de `.env.example`.
2. `vercel.json` programa `/api/cron/prices` días hábiles 20:30 UTC (definir `CRON_SECRET`).
3. Webhook de Mercado Pago → `https://<dominio>/api/webhooks/mercadopago` con `MERCADOPAGO_WEBHOOK_SECRET`.

## Pendientes / próximos pasos

- **ARCA WSFE en producción:** implementar `EInvoicingProvider` con WSAA (certificado en Supabase Vault) o un proveedor (p. ej. AfipSDK). La construcción del request ya está testeada.
- **Brasil:** adaptador NF-e (SEFAZ), precios en sacas por defecto, traducción pt-BR.
- **Fotos del marketplace:** pasar a *signed upload URLs* para superar el límite de 4,5 MB por request de Vercel.
- **Panel de administración** para aprobar verificaciones de vendedores (hoy se hace en Supabase).
- **Pagos dentro del marketplace** (split de Mercado Pago) para cobrar la comisión automáticamente; hoy se registra en el pedido.
- **Canje → comprobante:** generar la NC/liquidación al registrar entregas de granos.
- **Fuentes de precios con licencia** (Matba-Rofex, CME DataMine) para uso comercial a escala; las actuales son públicas.
- Alertas de precios (tabla `price_alerts` ya creada), tests E2E (Playwright).
