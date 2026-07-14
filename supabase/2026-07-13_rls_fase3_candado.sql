-- =============================================================================
-- Bloque RLS — Fase 3: CANDADO (2026-07-13)
-- Requisito: CRM v5.27.0 ya en producción (manda token de sesión en
-- public_stores / daily_digests / storage). Cierra los hoyos encontrados en el
-- diagnóstico de fase 2:
--   1. "auth delete *" permitía BORRAR a cualquier sesión autenticada — y las
--      sesiones anónimas del storefront cuentan como autenticadas.
--   2. public_stores: INSERT/UPDATE/DELETE abiertos a anon.
--   3. daily_digests: INSERT abierto a anon (spam de correos).
--   4. inventory/purchases: full access {public} (temporal del bloque de sync).
--   5. storage store-photos: escritura pública.
-- Lo que NO se toca: políticas d2_* (admin todo / rep lo suyo, via
-- current_app_user()) y la lectura pública de public_stores y fotos (el sitio
-- las necesita).
-- Cómo correrlo: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- =============================================================================

-- ─── 0. Helper: ¿la sesión pertenece a un usuario del CRM (app_users)? ───────
-- Mismo estilo que is_admin(). Las sesiones anónimas tienen auth.uid() pero no
-- fila en app_users → false.
create or replace function public.is_app_user()
returns boolean
language sql stable security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.app_users where auth_user_id = auth.uid()
  );
$$;

-- ─── 1. Borrados en tablas core: solo admin ──────────────────────────────────
-- (Los d2_* de reps siguen dando a cada rep el manejo de lo suyo; la
-- propagación de borrados del CRM ya es admin-only en el código de la app.)
drop policy if exists "auth delete clients" on public.clients;
drop policy if exists "auth delete orders" on public.orders;
drop policy if exists "auth delete commissions" on public.commissions;
drop policy if exists "auth delete representatives" on public.representatives;

create policy "admin_delete_clients" on public.clients
  for delete to authenticated using (public.is_admin());
create policy "admin_delete_orders" on public.orders
  for delete to authenticated using (public.is_admin());
create policy "admin_delete_commissions" on public.commissions
  for delete to authenticated using (public.is_admin());
create policy "admin_delete_representatives" on public.representatives
  for delete to authenticated using (public.is_admin());

-- ─── 2. inventory y purchases: solo usuarios del CRM ─────────────────────────
drop policy if exists "inventory_full_access" on public.inventory;
drop policy if exists "purchases_full_access" on public.purchases;

create policy "app_users_all_inventory" on public.inventory
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());
create policy "app_users_all_purchases" on public.purchases
  for all to authenticated
  using (public.is_app_user()) with check (public.is_app_user());

-- ─── 3. public_stores: lectura pública se queda, escritura solo CRM ─────────
drop policy if exists "crm_sync_stores_insert" on public.public_stores;
drop policy if exists "crm_sync_stores_update" on public.public_stores;
drop policy if exists "crm_sync_stores_delete" on public.public_stores;
drop policy if exists "public_read_stores" on public.public_stores; -- redundante con "Public read access"

create policy "app_users_insert_stores" on public.public_stores
  for insert to authenticated with check (public.is_app_user());
create policy "app_users_update_stores" on public.public_stores
  for update to authenticated
  using (public.is_app_user()) with check (public.is_app_user());
create policy "app_users_delete_stores" on public.public_stores
  for delete to authenticated using (public.is_app_user());

-- ─── 4. daily_digests: solo usuarios del CRM ─────────────────────────────────
-- SELECT también, porque el INSERT del CRM pide la fila de vuelta
-- (Prefer: return=representation) y sin SELECT el insert fallaría con 42501.
drop policy if exists "crm_insert_digest" on public.daily_digests;

create policy "app_users_insert_digest" on public.daily_digests
  for insert to authenticated with check (public.is_app_user());
create policy "app_users_read_digest" on public.daily_digests
  for select to authenticated using (public.is_app_user());

-- ─── 5. Fotos (storage, bucket store-photos): lectura pública, escritura CRM ─
drop policy if exists "Allow uploads to store photos" on storage.objects;
drop policy if exists "Allow updates to store photos" on storage.objects;
drop policy if exists "Allow deletes to store photos" on storage.objects;
-- "Public read store photos" se queda: el sitio público muestra las fotos.

create policy "app_users_upload_store_photos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'store-photos' and public.is_app_user());
create policy "app_users_update_store_photos" on storage.objects
  for update to authenticated
  using (bucket_id = 'store-photos' and public.is_app_user())
  with check (bucket_id = 'store-photos' and public.is_app_user());
create policy "app_users_delete_store_photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'store-photos' and public.is_app_user());

-- ─── 6. Verificación: estado final de todas las políticas ────────────────────
select tablename, policyname, cmd, roles, qual is not null as tiene_qual, with_check is not null as tiene_check
from pg_policies
where (schemaname = 'public' and tablename in
        ('clients','orders','representatives','commissions',
         'inventory','purchases','public_stores','daily_digests'))
   or (schemaname = 'storage' and tablename = 'objects')
order by tablename, policyname;
