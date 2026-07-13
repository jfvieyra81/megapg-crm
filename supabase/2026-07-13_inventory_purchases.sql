-- =============================================================================
-- Bloque sync-inventario (CRM v5.25.0) — 2026-07-13
-- Crea las tablas cloud para `inventory` y `purchases`, que hasta ahora vivían
-- solo en el localStorage de cada dispositivo (causa de stock divergente entre
-- celular y computadora).
--
-- Mismo patrón que clients/orders/representatives/commissions:
--   id text (para inventory, id = productId porque sus registros no tienen id
--   propio), payload completo en `data` (jsonb), y `updated_at`.
--
-- Cómo correrlo: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- =============================================================================

create table if not exists public.inventory (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.purchases (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.inventory enable row level security;
alter table public.purchases enable row level security;

-- Acceso permisivo, igual al patrón vigente de las tablas core del CRM.
-- ⚠️ Pendiente: endurecer estas políticas junto con el bloque RLS de las
-- tablas core (clients/orders/representatives/commissions), todas a la vez.
create policy "inventory_full_access" on public.inventory
  for all using (true) with check (true);

create policy "purchases_full_access" on public.purchases
  for all using (true) with check (true);
