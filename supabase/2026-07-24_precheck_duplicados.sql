-- =====================================================================
-- PRECHECK READ-ONLY — antes de aplicar la migracion import_web_order
-- Fecha: 2026-07-24  ·  Rama: sprint/web-order-idempotency
-- Diseno: supabase/2026-07-24_DISENO_import_web_order.md (rev. 3)
--
-- ⚠️  SOLO LECTURA. Ninguna consulta modifica datos ni esquema (solo
--     SELECT + metadata de catalogo). NO EXISTE STAGING: correr esto en
--     el proyecto de produccion es seguro (no escribe nada), una seccion
--     a la vez, y revisar los resultados a mano.
--
-- Las consultas que inspeccionan processed_order_id usan
-- to_jsonb(wo) ->> 'processed_order_id' en lugar de la columna directa,
-- para que este archivo corra SIN error tanto ANTES como DESPUES de la
-- migracion (si la columna no existe todavia, el valor sale NULL).
--
-- GATE PRINCIPAL (rev. 2026-07-24b): aplicar la migracion SOLO si la
-- consulta #12 devuelve
--
--     ok_para_migrar_estructura = true
--
-- Esa es la compuerta REAL: mide integridad estructural y nada mas.
--
-- ⚠️  NO usar 'ok_para_migrar' como compuerta. Se conserva por
--     compatibilidad, pero es el flag ESTRICTO heredado: incluye
--     imported_sin_vinculo = 0, y esos 13 pedidos web historicos quedan sin
--     vinculo DE FORMA PERMANENTE por decision aprobada
--     (ver docs/RECONCILIACION_HISTORICA.md). Por eso 'ok_para_migrar'
--     seguira siendo false para siempre y NO indica ningun problema.
--
-- Los tres conceptos van SEPARADOS y no deben mezclarse:
--   ok_para_migrar_estructura          → compuerta de despliegue (boolean)
--   historical_reconciliation_required → estado conocido y aceptado (boolean)
--   operational_index_review_required  → decision humana sobre el indice
--
-- El tamano de orders (#11) es una evaluacion OPERACIONAL SEPARADA y no
-- entra en ningun booleano de compuerta.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. GATE — Duplicados actuales de orders.data->>'webOrderId'
--    Esperado: 0 filas. Si hay filas, NO crear el indice unico todavia.
-- ---------------------------------------------------------------------
select
  data ->> 'webOrderId' as web_order_id,
  count(*)              as veces_repetido,
  array_agg(id)         as order_ids
from public.orders
where data ->> 'webOrderId' is not null
  and data ->> 'webOrderId' <> ''
group by data ->> 'webOrderId'
having count(*) > 1
order by veces_repetido desc;


-- ---------------------------------------------------------------------
-- 2. DETALLE para reconciliacion manual — cada web_order 'imported' SIN
--    vinculo persistente verificable (no existe order con ese webOrderId).
--    Muestra SOLO lo necesario para que una persona reconcilie a mano.
--    ⚠️  NO se vincula automaticamente con orders por monto, telefono ni
--        fecha. Cualquier coincidencia por esos campos seria un CANDIDATO,
--        nunca una confirmacion. Este precheck no propone candidatos.
--    processed_order_id via to_jsonb: corre aunque la columna no exista aun.
-- ---------------------------------------------------------------------
select
  wo.id                                   as web_order_id,
  wo.negocio,
  wo.phone,
  wo.total,
  wo.created_at,
  wo.status,
  to_jsonb(wo) ->> 'processed_order_id'   as processed_order_id
from public.web_orders wo
where wo.status = 'imported'
  and not exists (
    select 1 from public.orders o
    where o.data ->> 'webOrderId' = wo.id::text
  )
order by wo.created_at desc;


-- ---------------------------------------------------------------------
-- 3. Productos referenciados en web_orders.items (pending) SIN fila en
--    inventory. La RPC rechaza (INVENTORY_PRODUCT_NOT_FOUND + rollback)
--    cualquier producto sin fila. Revisar si hay que crear su fila antes.
-- ---------------------------------------------------------------------
select distinct
  it.item ->> 'productId' as product_id,
  count(*) over (partition by it.item ->> 'productId') as apariciones
from public.web_orders wo
cross join lateral jsonb_array_elements(coalesce(wo.items, '[]'::jsonb)) as it(item)
where wo.status = 'pending'
  and coalesce(it.item ->> 'productId', '') <> ''
  and not exists (
    select 1 from public.inventory inv
    where inv.id = it.item ->> 'productId'
  )
order by product_id;


-- ---------------------------------------------------------------------
-- 4. Telefonos normalizados DUPLICADOS en clients
--    La RPC busca cliente por telefono normalizado con LIMIT 1; si hay
--    duplicados, podria reusar un cliente arbitrario entre varios.
--    Normalizacion identica a normPhone: solo digitos; si son 10, '1'+.
-- ---------------------------------------------------------------------
with norm as (
  select
    c.id,
    case
      when length(regexp_replace(coalesce(c.data ->> 'phone', ''), '\D', '', 'g')) = 10
        then '1' || regexp_replace(coalesce(c.data ->> 'phone', ''), '\D', '', 'g')
      else regexp_replace(coalesce(c.data ->> 'phone', ''), '\D', '', 'g')
    end as phone_norm
  from public.clients c
)
select phone_norm, count(*) as clientes, array_agg(id) as client_ids
from norm
where phone_norm <> ''
group by phone_norm
having count(*) > 1
order by clientes desc;


-- ---------------------------------------------------------------------
-- 5. Existencia de public.is_admin() (la RPC depende de ella)
--    Esperado: 1 fila. Muestra si es SECURITY DEFINER y su search_path.
-- ---------------------------------------------------------------------
select
  n.nspname as schema,
  p.proname as function_name,
  pg_get_function_arguments(p.oid) as arguments,
  p.prosecdef as security_definer,
  p.proconfig as config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'is_admin';


-- ---------------------------------------------------------------------
-- 6. RLS habilitado en las tablas relevantes
--    Esperado: rls_enabled = true en las 5 tablas.
-- ---------------------------------------------------------------------
select relname as table_name,
       relrowsecurity  as rls_enabled,
       relforcerowsecurity as rls_forced
from pg_class
where relnamespace = 'public'::regnamespace
  and relname in ('web_orders', 'orders', 'clients', 'inventory', 'app_users')
order by relname;


-- ---------------------------------------------------------------------
-- 7. Orders con source='web_order' pero webOrderId NULL o vacio
--    (integridad: un pedido web_order sin su llave rompe la trazabilidad).
--    Esperado: 0 filas.
-- ---------------------------------------------------------------------
select o.id, o.data ->> 'source' as source, o.data ->> 'webOrderId' as web_order_id
from public.orders o
where o.data ->> 'source' = 'web_order'
  and coalesce(o.data ->> 'webOrderId', '') = ''
order by o.id;


-- ---------------------------------------------------------------------
-- 8. web_orders.items.qty (lineas con productId) NO numerico, <=0 o
--    fraccionario. La RPC lo rechaza con WEB_ORDER_ITEMS_INVALID.
--    Cast guardado por CASE para no fallar ante datos malformados.
--    Esperado: 0 filas (para pedidos 'pending').
-- ---------------------------------------------------------------------
select
  wo.id                     as web_order_id,
  wo.status,
  it.item ->> 'productId'   as product_id,
  it.item -> 'qty'          as qty_raw,
  jsonb_typeof(it.item -> 'qty') as qty_type
from public.web_orders wo
cross join lateral jsonb_array_elements(coalesce(wo.items, '[]'::jsonb)) as it(item)
where coalesce(it.item ->> 'productId', '') <> ''
  and ( jsonb_typeof(it.item -> 'qty') is distinct from 'number'
     or case when jsonb_typeof(it.item -> 'qty') = 'number'
             then (it.item ->> 'qty')::numeric <= 0
               or (it.item ->> 'qty')::numeric <> trunc((it.item ->> 'qty')::numeric)
             else false end )
order by wo.status, wo.id;


-- ---------------------------------------------------------------------
-- 9. processed_order_id que NO existe como pedido en orders (huerfano).
--    Usa to_jsonb para correr aunque la columna no exista todavia.
--    Esperado: 0 filas.
-- ---------------------------------------------------------------------
select
  wo.id                                   as web_order_id,
  to_jsonb(wo) ->> 'processed_order_id'   as processed_order_id
from public.web_orders wo
where to_jsonb(wo) ->> 'processed_order_id' is not null
  and not exists (
    select 1 from public.orders o
    where o.id = to_jsonb(wo) ->> 'processed_order_id'
  )
order by wo.id;


-- ---------------------------------------------------------------------
-- 10. processed_order_id CONTRADICTORIO con el order identificado por
--     data->>'webOrderId' (fuente autoritativa). Esperado: 0 filas.
--     Esta es exactamente la condicion que la RPC rechaza con
--     WEB_ORDER_LINK_CONFLICT.
-- ---------------------------------------------------------------------
select
  wo.id                                   as web_order_id,
  to_jsonb(wo) ->> 'processed_order_id'   as processed_order_id,
  o.id                                    as order_por_web_order_id
from public.web_orders wo
join public.orders o on o.data ->> 'webOrderId' = wo.id::text
where to_jsonb(wo) ->> 'processed_order_id' is not null
  and to_jsonb(wo) ->> 'processed_order_id' <> o.id
order by wo.id;


-- ---------------------------------------------------------------------
-- 11. EVALUACION OPERACIONAL SEPARADA — tamano de orders.
--     Informativa: NO entra en ok_para_migrar. Sirve para decidir si el
--     CREATE UNIQUE INDEX no-concurrente (que bloquea escrituras en orders
--     mientras corre) es aceptable, o si conviene CONCURRENTLY fuera de la
--     transaccion. NO se declara automaticamente "seguro".
-- ---------------------------------------------------------------------
select
  count(*)                                          as orders_row_count,
  pg_size_pretty(pg_total_relation_size('public.orders')) as orders_total_size,
  pg_total_relation_size('public.orders')           as orders_total_size_bytes
from public.orders;


-- ---------------------------------------------------------------------
-- 12. RESUMEN / VEREDICTO — una sola fila que separa CUATRO conceptos
--     distintos (ningun booleano unico que oculte por que falla):
--
--     A) schema_integrity_ok
--        false ante CUALQUIER anomalia tecnica: duplicados de webOrderId,
--        referencias processed_* huerfanas o contradictorias, productos
--        (pending) sin fila en inventory, qty malformada, RLS deshabilitado
--        en las tablas relevantes, o is_admin() ausente.
--
--     B) ok_para_migrar_estructura   ← ✅ ESTA ES LA COMPUERTA DE DESPLIEGUE
--        = schema_integrity_ok AND dup_web_order_id = 0
--        Mide UNICAMENTE si el esquema esta en condiciones de recibir la
--        migracion. NO mezcla la reconciliacion historica. Es el unico
--        booleano que debe consultarse en el checklist de despliegue.
--
--     C) historical_reconciliation_required
--        true cuando existan web_orders 'imported' SIN vinculo persistente
--        verificable (los del detalle #2). ESTADO CONOCIDO Y ACEPTADO: los 13
--        registros historicos quedan sin vinculo de forma permanente por
--        decision aprobada (docs/RECONCILIACION_HISTORICA.md). NO bloquea el
--        despliegue y NO se reconcilia automaticamente.
--
--     D) operational_index_review_required
--        SIEMPRE true. El CREATE UNIQUE INDEX no-concurrente bloquea
--        escrituras en orders mientras corre; NO se infiere seguridad por
--        tamano. Una persona debe revisar row count (#11), tamano y
--        actividad de escrituras antes de aplicar. Solo un humano lo cierra.
--
--     ok_para_migrar (HEREDADO, solo compatibilidad)
--        = schema_integrity_ok AND NOT historical_reconciliation_required.
--        ⚠️  NO USAR COMO COMPUERTA. Mezcla estructura con historia, asi que
--            va a devolver false permanentemente mientras existan los 13
--            registros historicos sin vinculo — lo cual es el estado
--            DESEADO, no un problema. Se conserva unicamente para no romper
--            notas o scripts previos que lo referencien.
--
--     Las columnas de conteo de abajo muestran EXACTAMENTE por que un flag
--     es false, para que ningun veredicto sea una caja negra.
-- ---------------------------------------------------------------------
with chk as (
  select
    -- duplicados de webOrderId
    (select count(*) from (
        select 1 from public.orders
        where data ->> 'webOrderId' is not null and data ->> 'webOrderId' <> ''
        group by data ->> 'webOrderId' having count(*) > 1
     ) d)                                                     as dup_web_order_id,
    -- is_admin() existe
    (select count(*) from pg_proc p
       join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'is_admin')  as is_admin_count,
    -- orders source=web_order sin webOrderId
    (select count(*) from public.orders o
       where o.data ->> 'source' = 'web_order'
         and coalesce(o.data ->> 'webOrderId', '') = '')       as src_web_order_sin_id,
    -- web_orders.items.qty malformada en pedidos pending
    (select count(*) from public.web_orders wo
       cross join lateral jsonb_array_elements(coalesce(wo.items, '[]'::jsonb)) as it(item)
       where wo.status = 'pending'
         and coalesce(it.item ->> 'productId', '') <> ''
         and ( jsonb_typeof(it.item -> 'qty') is distinct from 'number'
            or case when jsonb_typeof(it.item -> 'qty') = 'number'
                    then (it.item ->> 'qty')::numeric <= 0
                      or (it.item ->> 'qty')::numeric <> trunc((it.item ->> 'qty')::numeric)
                    else false end ))                          as qty_malformada_pending,
    -- productos (pending) referenciados sin fila en inventory
    (select count(*) from (
        select distinct it.item ->> 'productId' as pid
        from public.web_orders wo
        cross join lateral jsonb_array_elements(coalesce(wo.items, '[]'::jsonb)) as it(item)
        where wo.status = 'pending'
          and coalesce(it.item ->> 'productId', '') <> ''
          and not exists (select 1 from public.inventory inv
                          where inv.id = it.item ->> 'productId')
     ) s)                                                      as productos_sin_inventory,
    -- processed_order_id huerfano
    (select count(*) from public.web_orders wo
       where to_jsonb(wo) ->> 'processed_order_id' is not null
         and not exists (select 1 from public.orders o
                         where o.id = to_jsonb(wo) ->> 'processed_order_id'))
                                                               as processed_huerfano,
    -- processed_order_id contradictorio
    (select count(*) from public.web_orders wo
       join public.orders o on o.data ->> 'webOrderId' = wo.id::text
       where to_jsonb(wo) ->> 'processed_order_id' is not null
         and to_jsonb(wo) ->> 'processed_order_id' <> o.id)    as processed_contradictorio,
    -- tablas relevantes con RLS deshabilitado (esperado 0)
    (select count(*) from pg_class
       where relnamespace = 'public'::regnamespace
         and relname in ('web_orders','orders','clients','inventory','app_users')
         and relrowsecurity = false)                          as rls_deshabilitado,
    -- web_orders 'imported' sin vinculo persistente (reconciliacion)
    (select count(*) from public.web_orders wo
       where wo.status = 'imported'
         and not exists (select 1 from public.orders o
                         where o.data ->> 'webOrderId' = wo.id::text))
                                                               as imported_sin_vinculo
)
select
  -- conteos crudos (muestran POR QUE falla cada flag)
  dup_web_order_id,
  is_admin_count,
  src_web_order_sin_id,
  qty_malformada_pending,
  productos_sin_inventory,
  processed_huerfano,
  processed_contradictorio,
  rls_deshabilitado,
  imported_sin_vinculo,
  -- A) integridad de esquema/datos
  (dup_web_order_id = 0
   and is_admin_count >= 1
   and src_web_order_sin_id = 0
   and qty_malformada_pending = 0
   and productos_sin_inventory = 0
   and processed_huerfano = 0
   and processed_contradictorio = 0
   and rls_deshabilitado = 0)                                 as schema_integrity_ok,
  -- B) ✅ COMPUERTA DE DESPLIEGUE: solo integridad estructural.
  --    NO incluye la reconciliacion historica.
  (
    (dup_web_order_id = 0
     and is_admin_count >= 1
     and src_web_order_sin_id = 0
     and qty_malformada_pending = 0
     and productos_sin_inventory = 0
     and processed_huerfano = 0
     and processed_contradictorio = 0
     and rls_deshabilitado = 0)
    and dup_web_order_id = 0
  )                                                           as ok_para_migrar_estructura,
  -- C) reconciliacion historica: estado CONOCIDO Y ACEPTADO, no bloquea.
  (imported_sin_vinculo > 0)                                  as historical_reconciliation_required,
  -- D) revision operacional del indice — SIEMPRE requerida (humana).
  true                                                        as operational_index_review_required,
  -- HEREDADO (compatibilidad). ⚠️ NO USAR COMO COMPUERTA: mezcla estructura
  -- con historia, asi que sera false de forma permanente mientras los 13
  -- registros historicos sigan sin vinculo, lo cual es el estado DESEADO.
  (dup_web_order_id = 0
   and is_admin_count >= 1
   and src_web_order_sin_id = 0
   and qty_malformada_pending = 0
   and productos_sin_inventory = 0
   and processed_huerfano = 0
   and processed_contradictorio = 0
   and rls_deshabilitado = 0
   and imported_sin_vinculo = 0)                              as ok_para_migrar,
  -- Veredicto legible, para que el checklist no dependa de interpretar flags.
  case
    when not (dup_web_order_id = 0
              and is_admin_count >= 1
              and src_web_order_sin_id = 0
              and qty_malformada_pending = 0
              and productos_sin_inventory = 0
              and processed_huerfano = 0
              and processed_contradictorio = 0
              and rls_deshabilitado = 0)
      then 'DETENERSE — hay una anomalia estructural; revisar los conteos de esta fila'
    when imported_sin_vinculo > 0
      then 'ESTRUCTURA OK PARA MIGRAR — quedan ' || imported_sin_vinculo::text
           || ' pedidos web historicos sin vinculo (estado aceptado y documentado). '
           || 'Falta cerrar a mano la revision operacional del indice (consulta #11).'
    else 'ESTRUCTURA OK PARA MIGRAR — sin reconciliacion historica pendiente. '
         || 'Falta cerrar a mano la revision operacional del indice (consulta #11).'
  end                                                         as veredicto
from chk;
