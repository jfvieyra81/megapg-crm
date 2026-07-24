-- =====================================================================
-- DIAGNOSTICO READ-ONLY — Sprint 1A: importacion idempotente pedidos web
-- Fecha: 2026-07-24
--
-- ⚠️  NO EJECUTAR EN PRODUCCION. Correr manualmente en Supabase STAGING
--     (SQL Editor), una seccion a la vez. Ninguna de estas consultas
--     modifica datos: son todas SELECT / metadata de catalogo.
--
-- Objetivo: levantar el estado real de las tablas involucradas antes
-- de disenar la funcion RPC public.import_web_order (Fase 2) y las
-- columnas/indices de trazabilidad (Fase 3).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. Columnas reales de cada tabla involucrada
-- ---------------------------------------------------------------------
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('web_orders', 'orders', 'clients', 'inventory', 'app_users')
order by table_name, ordinal_position;


-- ---------------------------------------------------------------------
-- 2. Indices actuales sobre esas tablas
-- ---------------------------------------------------------------------
select schemaname, tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename in ('web_orders', 'orders', 'clients', 'inventory', 'app_users')
order by tablename, indexname;


-- ---------------------------------------------------------------------
-- 3. Constraints actuales (PK, FK, UNIQUE, CHECK)
-- ---------------------------------------------------------------------
select
  tc.table_name,
  tc.constraint_name,
  tc.constraint_type,
  kcu.column_name
from information_schema.table_constraints tc
left join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name
  and tc.table_schema = kcu.table_schema
where tc.table_schema = 'public'
  and tc.table_name in ('web_orders', 'orders', 'clients', 'inventory', 'app_users')
order by tc.table_name, tc.constraint_type, tc.constraint_name;


-- ---------------------------------------------------------------------
-- 4. Politicas RLS actuales sobre esas tablas (incluye web_orders,
--    que NO aparece en ningun script de RLS existente en el repo —
--    es el hueco principal a confirmar aqui)
-- ---------------------------------------------------------------------
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('web_orders', 'orders', 'clients', 'inventory', 'app_users')
order by tablename, policyname;

-- Confirmar si RLS esta activo en cada tabla (rowsecurity = true)
select relname as table_name, relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('web_orders', 'orders', 'clients', 'inventory', 'app_users');


-- ---------------------------------------------------------------------
-- 5. Funciones existentes relacionadas (is_admin, is_app_user, y
--    cualquier otra que ya toque estas tablas)
-- ---------------------------------------------------------------------
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as config  -- aqui aparece search_path si esta fijado
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and (
    p.proname ilike '%order%'
    or p.proname ilike '%app_user%'
    or p.proname ilike '%admin%'
    or p.proname ilike '%inventory%'
    or p.proname ilike '%import%'
  )
order by p.proname;

-- Definicion completa de is_admin() e is_app_user() para referencia
select pg_get_functiondef(oid)
from pg_proc
where proname in ('is_admin', 'is_app_user')
  and pronamespace = 'public'::regnamespace;


-- ---------------------------------------------------------------------
-- 6. Duplicados historicos por webOrderId dentro de orders.data (JSONB)
--    Si esta consulta devuelve filas, HAY que resolverlas manualmente
--    antes de crear el indice unico en Fase 3 — no se borran solos.
-- ---------------------------------------------------------------------
select
  data ->> 'webOrderId' as web_order_id,
  count(*) as veces_repetido,
  array_agg(id) as order_ids,
  array_agg(created_at) as fechas_creacion
from public.orders
where data ->> 'webOrderId' is not null
  and data ->> 'webOrderId' <> ''
group by data ->> 'webOrderId'
having count(*) > 1
order by veces_repetido desc;


-- ---------------------------------------------------------------------
-- 7. Pedidos web marcados "imported" sin un pedido CRM correspondiente
--    NOTA: hoy web_orders no tiene columna processed_order_id (se
--    agregara en Fase 3). Este query usa el estado ACTUAL del esquema:
--    busca web_orders.status = 'imported' cuyo id no aparece como
--    webOrderId en ningun order — es la senal equivalente hoy.
-- ---------------------------------------------------------------------
select wo.id, wo.status, wo.created_at, wo.approved_at, wo.negocio, wo.encargado
from public.web_orders wo
where wo.status = 'imported'
  and not exists (
    select 1 from public.orders o
    where o.data ->> 'webOrderId' = wo.id::text
  )
order by wo.created_at desc;


-- ---------------------------------------------------------------------
-- 8. Pedidos CRM con webOrderId pero SIN coincidencia en web_orders
--    (huerfanos: el order "dice" venir de un web_order que ya no existe
--    o nunca existio con ese id — revisar si son datos de prueba viejos)
-- ---------------------------------------------------------------------
select o.id as order_id, o.data ->> 'webOrderId' as web_order_id, o.created_at
from public.orders o
where o.data ->> 'webOrderId' is not null
  and o.data ->> 'webOrderId' <> ''
  and not exists (
    select 1 from public.web_orders wo
    where wo.id::text = o.data ->> 'webOrderId'
  )
order by o.created_at desc;


-- ---------------------------------------------------------------------
-- 9. Extra util para Fase 4/5: distribucion de status en web_orders
--    (para saber cuantos "pending" hay que migrar en vivo, cuantos
--    "ignored", etc. — solo informativo)
-- ---------------------------------------------------------------------
select status, count(*) as total
from public.web_orders
group by status
order by total desc;


-- ---------------------------------------------------------------------
-- 10. Extra util para Fase 5: filas de inventory sin stock o negativas
--     (contexto para decidir la politica de stock insuficiente)
-- ---------------------------------------------------------------------
select id, data ->> 'productId' as product_id, (data ->> 'stock')::numeric as stock
from public.inventory
where (data ->> 'stock')::numeric <= 0
order by stock asc;
