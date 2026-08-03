-- =============================================================================
-- SPRINT 2.6 — Acotar acceso de role='rep' + descuento seguro de inventario
-- (2026-08-01)
--
-- Contexto: la auditoría de Sprint 2.6 encontró que cualquier rep podía leer
-- inventory/purchases completos (costo, retail, utilidad) porque esas tablas
-- solo exigían is_app_user() (cualquier usuario del CRM), sin distinguir rol.
-- Este script:
--   A. Crea un ledger de idempotencia para el descuento de inventario por
--      pedido (sin foreign key a orders — un pedido puede borrarse después y
--      el ledger debe seguir bloqueando una segunda aplicación del mismo
--      order_id).
--   B. rep_inventory_stock(): proyección de solo lectura (product_id, stock,
--      last_restock) para que un rep pueda ver disponibilidad sin tocar la
--      tabla real.
--   C. apply_order_inventory(order_id): único camino (admin y rep) para
--      descontar inventario al crear un pedido. Verifica ownership, lee items
--      del pedido YA guardado (nunca del navegador), bloquea filas en orden
--      determinista, no permite negativos, y es idempotente vía el ledger.
--   D. inventory y purchases pasan a admin-only para acceso directo.
--
-- Cómo correrlo: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- =============================================================================

begin;

-- ─── A. Ledger de idempotencia (sin FK a orders — decisión explícita) ───────
create table if not exists public.order_inventory_applications (
  order_id   text primary key,
  applied_at timestamptz not null default now(),
  applied_by uuid not null references auth.users(id),
  result     jsonb not null default '{}'::jsonb
);

alter table public.order_inventory_applications enable row level security;
-- Sin policies a propósito: RLS habilitado + cero policies = cero acceso vía
-- API para anon/authenticated (admin incluido). Solo apply_order_inventory()
-- puede leerla/escribirla, porque corre SECURITY DEFINER como dueña de la tabla.

-- ─── B. Proyección segura de stock para representantes ──────────────────────
create or replace function public.rep_inventory_stock()
returns table(product_id text, stock numeric, last_restock timestamptz)
language sql
stable
security definer
set search_path to 'public'
as $$
  select (data->>'productId')::text, (data->>'stock')::numeric, (data->>'lastRestock')::timestamptz
  from public.inventory
  where public.is_app_user();
$$;

revoke all on function public.rep_inventory_stock() from public;
grant execute on function public.rep_inventory_stock() to authenticated;
-- Supabase otorga EXECUTE a anon por defecto en toda función nueva (privilegio
-- separado del de PUBLIC) — "revoke ... from public" no lo toca. Se revoca
-- explícito para que "solo authenticated" sea literal, no solo intención.
revoke execute on function public.rep_inventory_stock() from anon;

-- ─── C. Descuento de inventario por pedido — camino único admin + rep ───────
create or replace function public.apply_order_inventory(p_order_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_order       public.orders%rowtype;
  v_client      public.clients%rowtype;
  v_caller      record;
  v_reserved_id text;
  v_existing    public.order_inventory_applications%rowtype;
  v_pids        text[];
  v_deltas      numeric[];
  v_stocks      numeric[] := '{}';
  v_shortfalls  jsonb := '[]'::jsonb;
  v_result      jsonb;
  v_i           integer;
  v_stock       numeric;
begin
  -- autorización: quién soy
  select * into v_caller from public.current_app_user();
  if v_caller.auth_user_id is null then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- localizar y bloquear el pedido YA GUARDADO (debe existir, aunque el
  -- ledger no tenga FK a esta tabla)
  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002', detail = p_order_id;
  end if;

  -- ownership: admin, o rep dueño del cliente de ese pedido
  if v_caller.role <> 'admin' then
    select * into v_client from public.clients where id = v_order.client_id;
    if not found or v_client.representative_id is distinct from v_caller.representative_id then
      raise exception 'NOT_OWNER' using errcode = '42501', detail = p_order_id;
    end if;
  end if;

  -- reservar order_id en el ledger (compare-and-set atómico)
  insert into public.order_inventory_applications (order_id, applied_by)
  values (p_order_id, auth.uid())
  on conflict (order_id) do nothing
  returning order_id into v_reserved_id;

  if v_reserved_id is null then
    select * into v_existing from public.order_inventory_applications where order_id = p_order_id;
    return jsonb_build_object(
      'success', true, 'alreadyApplied', true, 'orderId', p_order_id,
      'inventoryUpdated', coalesce(v_existing.result -> 'inventoryUpdated', to_jsonb(0))
    );
  end if;

  -- items desde el pedido guardado — nunca del navegador
  if v_order.data -> 'items' is null or jsonb_typeof(v_order.data -> 'items') <> 'array' then
    raise exception 'ORDER_HAS_NO_ITEMS' using errcode = '22023', detail = p_order_id;
  end if;

  select array_agg(pid order by pid), array_agg(qty order by pid)
    into v_pids, v_deltas
  from (
    select x ->> 'productId' as pid, sum((x ->> 'qty')::numeric) as qty
    from jsonb_array_elements(v_order.data -> 'items') x
    where coalesce(x ->> 'productId', '') <> ''
      and jsonb_typeof(x -> 'qty') = 'number'
      and (x ->> 'qty')::numeric > 0
    group by x ->> 'productId'
  ) s;

  if v_pids is null then
    raise exception 'NO_VALID_ITEMS' using errcode = '22023', detail = p_order_id;
  end if;

  -- lock de inventario en orden determinista, lectura de stock actual
  for v_i in 1 .. array_length(v_pids, 1) loop
    select coalesce((data->>'stock')::numeric, 0) into v_stock
      from public.inventory where id = v_pids[v_i] for update;
    if not found then
      raise exception 'INVENTORY_PRODUCT_NOT_FOUND' using errcode = 'P0004', detail = v_pids[v_i];
    end if;
    v_stocks := array_append(v_stocks, v_stock);
  end loop;

  -- validar TODO antes de tocar nada — sin clamp, sin descuento parcial
  for v_i in 1 .. array_length(v_pids, 1) loop
    if v_stocks[v_i] < v_deltas[v_i] then
      v_shortfalls := v_shortfalls || jsonb_build_array(jsonb_build_object(
        'productId', v_pids[v_i], 'available', v_stocks[v_i], 'requested', v_deltas[v_i]));
    end if;
  end loop;

  if jsonb_array_length(v_shortfalls) > 0 then
    -- rollback completo: incluye la reserva del ledger de arriba
    raise exception 'INSUFFICIENT_STOCK' using errcode = 'P0010', detail = v_shortfalls::text;
  end if;

  -- solo aquí, con todo validado, se descuenta
  for v_i in 1 .. array_length(v_pids, 1) loop
    update public.inventory
      set data = jsonb_set(data, '{stock}', to_jsonb(v_stocks[v_i] - v_deltas[v_i])),
          updated_at = now()
      where id = v_pids[v_i];
  end loop;

  v_result := jsonb_build_object(
    'success', true, 'alreadyApplied', false, 'orderId', p_order_id,
    'inventoryUpdated', array_length(v_pids, 1)
  );

  update public.order_inventory_applications set result = v_result where order_id = p_order_id;

  return v_result;
end;
$$;

revoke all on function public.apply_order_inventory(text) from public;
grant execute on function public.apply_order_inventory(text) to authenticated;
revoke execute on function public.apply_order_inventory(text) from anon;

-- ─── D. inventory / purchases: admin-only para acceso directo ───────────────
drop policy if exists "app_users_all_inventory" on public.inventory;
drop policy if exists "app_users_all_purchases" on public.purchases;
drop policy if exists "admin_all_inventory" on public.inventory;
drop policy if exists "admin_all_purchases" on public.purchases;

create policy "admin_all_inventory" on public.inventory
  for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin_all_purchases" on public.purchases
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

commit;

-- ─── Verificación (solo lectura) ─────────────────────────────────────────────
select tablename, policyname, cmd, roles from pg_policies
  where tablename in ('inventory', 'purchases', 'order_inventory_applications')
  order by tablename, policyname;

select proname, prosecdef from pg_proc
  where proname in ('rep_inventory_stock', 'apply_order_inventory')
  and pronamespace = 'public'::regnamespace;
