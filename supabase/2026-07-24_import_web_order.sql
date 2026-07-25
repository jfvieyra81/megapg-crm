-- =====================================================================
-- MIGRACION — Sprint 1A: importacion idempotente y transaccional de
--             pedidos web  ·  public.import_web_order(...)
-- Fecha: 2026-07-24  ·  Rama: sprint/web-order-idempotency
-- Diseno: supabase/2026-07-24_DISENO_import_web_order.md (rev. 3)
--
-- ⚠️  NO EJECUTADO. NO EXISTE STAGING (solo el proyecto de produccion).
--     Este archivo se ESCRIBE, no se corre. No aplicar a Supabase hasta
--     aprobacion explicita de Jose. Antes de correr esta migracion, correr
--     el precheck read-only (2026-07-24_precheck_duplicados.sql) y confirmar
--     ok_para_migrar = true. Tener el rollback a mano.
--
-- Orden interno: columnas de trazabilidad → indices → funcion → permisos.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Columnas de trazabilidad en web_orders (Fase 3). approved_at ya
--    existe y se conserva para no romper la UI actual.
--    Fuente autoritativa del vinculo web_order→order = orders.data->>'webOrderId'.
--    processed_order_id es traza denormalizada (auditoria), NO autoritativa.
-- ---------------------------------------------------------------------
alter table public.web_orders
  add column if not exists processed_order_id text,
  add column if not exists processed_at       timestamptz,
  add column if not exists processed_by       uuid;

-- ---------------------------------------------------------------------
-- 2. Idempotencia: indice unico parcial sobre orders.data->>'webOrderId'.
--
-- ⚠️  DECISION OPERACIONAL PENDIENTE (no resuelta en este archivo):
--     Este CREATE UNIQUE INDEX es NO CONCURRENTE. Durante su construccion
--     toma un lock SHARE sobre public.orders que BLOQUEA ESCRITURAS
--     (INSERT/UPDATE/DELETE) en esa tabla hasta terminar; las lecturas
--     siguen. Ademas, al estar dentro de BEGIN/COMMIT, el lock se sostiene
--     hasta el COMMIT final de toda la migracion.
--     → Antes de correrlo asi, revisar row count, tamano fisico y actividad
--       de escritura de orders (ver precheck: orders_row_count / _total_size).
--     → Si se decide CONCURRENTLY, NO puede ir dentro de BEGIN/COMMIT: hay
--       que sacar esta sentencia de la transaccion y correrla por separado.
--     El WHERE excluye a todos los orders historicos (0 tienen webOrderId),
--     asi que se crea sin conflicto. Es la garantia principal contra
--     duplicados (incluso si una escritura no pasara por la RPC).
-- ---------------------------------------------------------------------
create unique index if not exists orders_web_order_id_uq
  on public.orders ((data ->> 'webOrderId'))
  where data ? 'webOrderId';

-- ---------------------------------------------------------------------
-- 3. Indice de apoyo para buscar el pedido desde web_orders.
-- ---------------------------------------------------------------------
create index if not exists web_orders_processed_order_id_idx
  on public.web_orders (processed_order_id);

-- ---------------------------------------------------------------------
-- 4. Funcion RPC transaccional.
--    SECURITY DEFINER + search_path fijo + is_admin() al inicio.
--    Nombres completamente calificados. Cualquier RAISE revierte todo
--    (la funcion se ejecuta dentro de la transaccion del caller/PostgREST):
--    no hay bloque EXCEPTION que atrape, asi que toda excepcion propaga y
--    causa ROLLBACK TOTAL. No hay cambios parciales.
--
--    Orden de operaciones (decision 7):
--      a is_admin  b validar args  c lock web_order  d idempotencia+conflicto
--      e status+cruzada  f lookup cliente  g consolidar deltas
--      h lock inventory (orden por productId)  i verificar filas faltantes
--      j crear cliente si hace falta  k insert order  l update inventory
--      m update web_orders  n return
-- ---------------------------------------------------------------------
create or replace function public.import_web_order(
  p_web_order_id  text,
  p_order_id      text,
  p_new_client_id text,
  p_items         jsonb,
  p_deltas        jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_wo                 public.web_orders%rowtype;
  v_existing_order_id   text;
  v_existing_client_id  text;
  v_phone_norm          text;
  v_client_id           text;
  v_need_client         boolean := false;
  v_client_created      boolean := false;
  v_calc_items_total    numeric;
  v_total               numeric;
  v_stock               numeric;
  v_after               numeric;
  v_updated             integer := 0;
  v_warnings            jsonb := '[]'::jsonb;  -- inventario (no bloquean)
  v_pricing_warnings    jsonb := '[]'::jsonb;  -- precio (no bloquean)
  v_delta               record;
  v_pids                text[]    := '{}';     -- productIds consolidados (orden pid)
  v_deltas_arr          numeric[] := '{}';     -- casesUsed consolidados
  v_stocks              numeric[] := '{}';     -- stock leido bajo lock
  v_i                   integer;
begin
  -- ===================================================================
  -- a. AUTORIZACION
  -- ===================================================================
  if not public.is_admin() then
    raise exception 'no_autorizado' using errcode = '42501';
  end if;

  -- ===================================================================
  -- b. VALIDACION DE ARGUMENTOS
  -- ===================================================================
  -- b.1 IDs obligatorios (p_new_client_id se valida solo si hay que crear).
  if p_web_order_id is null or btrim(p_web_order_id) = '' then
    raise exception 'INVALID_WEB_ORDER_ID' using errcode = '22023',
      detail = 'p_web_order_id nulo o vacio';
  end if;
  if p_order_id is null or btrim(p_order_id) = '' then
    raise exception 'INVALID_ORDER_ID' using errcode = '22023',
      detail = 'p_order_id nulo o vacio';
  end if;

  -- b.2 Estructura de arreglos no vacios.
  if p_items is null or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0 then
    raise exception 'INVALID_ITEMS' using errcode = '22023',
      detail = 'p_items debe ser un arreglo JSON no vacio';
  end if;
  if p_deltas is null or jsonb_typeof(p_deltas) <> 'array'
     or jsonb_array_length(p_deltas) = 0 then
    raise exception 'INVALID_DELTAS' using errcode = '22023',
      detail = 'p_deltas debe ser un arreglo JSON no vacio';
  end if;

  -- b.3 Cada item: productId no vacio; qty JSON number, entero, > 0;
  --     priceAtSale/costAtSale JSON number >= 0. Los casts numericos van
  --     dentro de CASE guardado por jsonb_typeof para NO producir errores
  --     genericos de cast ante datos malformados (decision 5).
  if exists (
    select 1 from jsonb_array_elements(p_items) x
    where coalesce(x ->> 'productId', '') = ''
       or jsonb_typeof(x -> 'qty')         is distinct from 'number'
       or jsonb_typeof(x -> 'priceAtSale') is distinct from 'number'
       or jsonb_typeof(x -> 'costAtSale')  is distinct from 'number'
       or case when jsonb_typeof(x -> 'qty') = 'number'
               then (x ->> 'qty')::numeric <= 0
                 or (x ->> 'qty')::numeric <> trunc((x ->> 'qty')::numeric)
               else false end
       or case when jsonb_typeof(x -> 'priceAtSale') = 'number'
               then (x ->> 'priceAtSale')::numeric < 0 else false end
       or case when jsonb_typeof(x -> 'costAtSale') = 'number'
               then (x ->> 'costAtSale')::numeric < 0 else false end
  ) then
    raise exception 'INVALID_ITEMS' using errcode = '22023',
      detail = 'item invalido: productId vacio, qty no entero>0, o price/cost no numerico>=0';
  end if;

  -- b.4 Cada delta: productId no vacio; casesUsed JSON number > 0 (decimal ok).
  if exists (
    select 1 from jsonb_array_elements(p_deltas) x
    where coalesce(x ->> 'productId', '') = ''
       or jsonb_typeof(x -> 'casesUsed') is distinct from 'number'
       or case when jsonb_typeof(x -> 'casesUsed') = 'number'
               then (x ->> 'casesUsed')::numeric <= 0 else false end
  ) then
    raise exception 'INVALID_DELTAS' using errcode = '22023',
      detail = 'delta invalido: productId vacio o casesUsed no numerico>0';
  end if;

  -- b.5 Correspondencia BIDIRECCIONAL p_items <-> p_deltas por productId
  --     (consolidando por producto): cada productId de items debe tener
  --     delta y viceversa. Garantiza que ningun item quede sin descuento
  --     de inventario (decision 4). productIds vacios ya rechazados arriba.
  if exists (
    select 1
    from (select distinct i ->> 'productId' as pid from jsonb_array_elements(p_items) i)  pi
    full outer join
         (select distinct d ->> 'productId' as pid from jsonb_array_elements(p_deltas) d) pd
      on pi.pid = pd.pid
    where pi.pid is null or pd.pid is null
  ) then
    raise exception 'ITEMS_DELTAS_MISMATCH' using errcode = 'P0005',
      detail = 'p_items y p_deltas deben cubrir exactamente los mismos productId';
  end if;

  -- ===================================================================
  -- c. LOCK del web_order (serializa concurrencia)
  -- ===================================================================
  select * into v_wo
    from public.web_orders
    where id = p_web_order_id
    for update;
  if not found then
    raise exception 'WEB_ORDER_NOT_FOUND' using errcode = 'P0002',
      detail = format('web_order id=%s', p_web_order_id);
  end if;

  -- ===================================================================
  -- d. IDEMPOTENCIA + CONFLICTO DE VINCULO
  --    Fuente autoritativa = orders.data->>'webOrderId'. Si existe ese
  --    order, se detecta contradiccion con web_orders.processed_order_id
  --    (traza secundaria) SIN reconciliar ni sobrescribir (decision 2).
  -- ===================================================================
  select o.id, o.client_id into v_existing_order_id, v_existing_client_id
    from public.orders o
    where o.data ->> 'webOrderId' = p_web_order_id
    limit 1;
  if v_existing_order_id is not null then
    -- processed_order_id: NULL o igual → retorno idempotente; distinto → conflicto.
    if v_wo.processed_order_id is not null
       and v_wo.processed_order_id is distinct from v_existing_order_id then
      raise exception 'WEB_ORDER_LINK_CONFLICT' using errcode = 'P0006',
        detail = format('processed_order_id=%s pero order por webOrderId=%s',
                        v_wo.processed_order_id, v_existing_order_id);
    end if;
    return jsonb_build_object(
      'success', true,
      'alreadyImported', true,
      'webOrderId', p_web_order_id,
      'orderId', v_existing_order_id,
      'clientId', v_existing_client_id,
      'clientCreated', false,
      'inventoryUpdated', 0,
      'inventoryWarnings', '[]'::jsonb,
      'pricingWarnings', '[]'::jsonb
    );
  end if;

  -- ===================================================================
  -- e. STATUS + VALIDACION CRUZADA contra web_orders
  -- ===================================================================
  if v_wo.status is distinct from 'pending' then
    raise exception 'NOT_IMPORTABLE_STATUS' using errcode = 'P0003',
      detail = format('status=%s', coalesce(v_wo.status, '(null)'));
  end if;

  -- e.1 total autoritativo valido.
  if v_wo.total is null or v_wo.total < 0 then
    raise exception 'INVALID_ORDER_TOTAL' using errcode = '22023',
      detail = 'web_orders.total nulo o negativo';
  end if;

  -- e.2 web_orders.items.qty (lineas con productId) debe ser number, entero
  --     y > 0 ANTES de cualquier cast en la correspondencia. Cast guardado
  --     por CASE para error controlado ante historicos malformados (decision 5).
  if exists (
    select 1 from jsonb_array_elements(v_wo.items) w
    where coalesce(w ->> 'productId', '') <> ''
      and ( jsonb_typeof(w -> 'qty') is distinct from 'number'
         or case when jsonb_typeof(w -> 'qty') = 'number'
                 then (w ->> 'qty')::numeric <= 0
                   or (w ->> 'qty')::numeric <> trunc((w ->> 'qty')::numeric)
                 else false end )
  ) then
    raise exception 'WEB_ORDER_ITEMS_INVALID' using errcode = '22023',
      detail = 'web_orders.items.qty no numerico, <=0 o fraccionario';
  end if;

  -- e.3 Correspondencia items <-> web_orders.items por suma de qty/productId.
  --     (casts seguros: p_items validado en b.3, web_orders.items en e.2.)
  if exists (
    select 1
    from (
      select x ->> 'productId' as pid, sum((x ->> 'qty')::numeric) as q
      from jsonb_array_elements(p_items) x
      group by x ->> 'productId'
    ) pi
    left join (
      select w ->> 'productId' as pid, sum((w ->> 'qty')::numeric) as q
      from jsonb_array_elements(v_wo.items) w
      where coalesce(w ->> 'productId', '') <> ''
      group by w ->> 'productId'
    ) wi on wi.pid = pi.pid
    where wi.pid is null or wi.q is distinct from pi.q
  ) then
    raise exception 'ITEMS_MISMATCH' using errcode = 'P0005',
      detail = 'p_items no corresponde con web_orders.items (productId/qty)';
  end if;

  -- e.4 Total recalculado SOLO para aviso (no reemplaza, no bloquea).
  select coalesce(sum((x ->> 'priceAtSale')::numeric * (x ->> 'qty')::numeric), 0)
    into v_calc_items_total
    from jsonb_array_elements(p_items) x;
  if abs(v_calc_items_total - v_wo.total) > 0.01 then
    v_pricing_warnings := v_pricing_warnings || jsonb_build_array(jsonb_build_object(
      'code', 'ORDER_TOTAL_MISMATCH',
      'webOrderTotal', v_wo.total,
      'calculatedItemsTotal', round(v_calc_items_total, 2),
      'difference', round(v_calc_items_total - v_wo.total, 2)
    ));
  end if;

  -- ===================================================================
  -- f. RESOLUCION DEL CLIENTE (solo lookup; la creacion es fase j)
  --    Datos SOLO de v_wo; el frontend no envia datos de cliente.
  -- ===================================================================
  v_phone_norm := regexp_replace(coalesce(v_wo.phone, ''), '\D', '', 'g');
  if length(v_phone_norm) = 10 then
    v_phone_norm := '1' || v_phone_norm;
  end if;

  if length(v_phone_norm) > 0 then
    select c.id into v_client_id
      from public.clients c
      where (
        case
          when length(regexp_replace(coalesce(c.data ->> 'phone', ''), '\D', '', 'g')) = 10
            then '1' || regexp_replace(coalesce(c.data ->> 'phone', ''), '\D', '', 'g')
          else regexp_replace(coalesce(c.data ->> 'phone', ''), '\D', '', 'g')
        end
      ) = v_phone_norm
      limit 1;
  end if;
  v_need_client := (v_client_id is null);

  -- f.1 Si habra que crear cliente, exigir p_new_client_id AHORA (antes de
  --     tomar cualquier lock de inventory), para fallar temprano y limpio.
  if v_need_client and (p_new_client_id is null or btrim(p_new_client_id) = '') then
    raise exception 'INVALID_NEW_CLIENT_ID' using errcode = '22023',
      detail = 'se requiere p_new_client_id para crear cliente nuevo';
  end if;

  -- ===================================================================
  -- g + h + i. CONSOLIDAR DELTAS por productId, BLOQUEAR filas inventory
  --    en orden determinista (ORDER BY pid) y VERIFICAR que ninguna falte,
  --    ANTES de crear cliente/pedido/updates.
  -- ===================================================================
  for v_delta in
    select d.pid, sum(d.used) as used
    from (
      select x ->> 'productId' as pid, (x ->> 'casesUsed')::numeric as used
      from jsonb_array_elements(p_deltas) x
    ) d
    group by d.pid
    order by d.pid
  loop
    select coalesce((inv.data ->> 'stock')::numeric, 0) into v_stock
      from public.inventory inv
      where inv.id = v_delta.pid
      for update;
    if not found then
      raise exception 'INVENTORY_PRODUCT_NOT_FOUND' using errcode = 'P0004',
        detail = format('productId=%s sin fila en inventory', v_delta.pid);
    end if;
    v_pids       := array_append(v_pids, v_delta.pid);
    v_deltas_arr := array_append(v_deltas_arr, v_delta.used);
    v_stocks     := array_append(v_stocks, v_stock);
  end loop;

  -- ===================================================================
  -- j. CREAR CLIENTE si hace falta (p_new_client_id ya validado en fase f.1).
  -- ===================================================================
  if v_need_client then
    v_client_id := p_new_client_id;
    insert into public.clients (id, representative_id, data, updated_at)
    values (
      v_client_id, null,
      jsonb_build_object(
        'id',      v_client_id,
        'name',    coalesce(nullif(v_wo.negocio, ''), nullif(v_wo.encargado, ''),
                            'Cliente Web ' || right(v_phone_norm, 4)),
        'contact', coalesce(v_wo.encargado, ''),
        'phone',   coalesce(v_wo.phone, ''),
        'address', coalesce(v_wo.direccion, ''),
        'zone',    '',
        'tier',    'Lista',
        'notes',   'Pedido web ' || coalesce(v_wo.created_at::text, '')
                     || ' • Pago: ' || coalesce(nullif(v_wo.pago, ''), '—'),
        'created', to_jsonb(now()),
        'source',  'web'
      ),
      now()
    );
    v_client_created := true;
  end if;

  -- ===================================================================
  -- k. INSERT del PEDIDO (id = p_order_id). total = web_orders.total
  --    autoritativo; discount = 0. El indice unico parcial protege contra
  --    duplicados por webOrderId.
  -- ===================================================================
  v_total := v_wo.total;
  insert into public.orders (id, client_id, status, paid_date, data, updated_at)
  values (
    p_order_id, v_client_id, 'pending', null,
    jsonb_build_object(
      'id',        p_order_id,
      'clientId',  v_client_id,
      'date',      to_char(now(), 'YYYY-MM-DD'),
      'items',     p_items,
      'discount',  0,
      'total',     v_total,
      'status',    'pending',
      'notes',     'Importado de pedido web ' || p_web_order_id
                     || case when coalesce(v_wo.pago, '') <> ''
                             then ' • Pago: ' || v_wo.pago else '' end,
      'created',   to_jsonb(now()),
      'source',    'web_order',
      'webOrderId', p_web_order_id
    ),
    now()
  );

  -- ===================================================================
  -- l. UPDATE de INVENTARIO (filas ya bloqueadas en fase h). Clamp a cero
  --    con aviso; descuenta una sola vez.
  -- ===================================================================
  for v_i in 1 .. coalesce(array_length(v_pids, 1), 0) loop
    v_after := greatest(0, v_stocks[v_i] - v_deltas_arr[v_i]);
    if v_stocks[v_i] < v_deltas_arr[v_i] then
      v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
        'productId', v_pids[v_i],
        'requestedDelta', v_deltas_arr[v_i],
        'stockBefore', v_stocks[v_i],
        'stockAfter', v_after,
        'code', 'INSUFFICIENT_STOCK_CLAMPED'
      ));
    end if;
    update public.inventory
      set data = jsonb_set(data, '{stock}', to_jsonb(v_after)),
          updated_at = now()
      where id = v_pids[v_i];
    v_updated := v_updated + 1;
  end loop;

  -- ===================================================================
  -- m. UPDATE de web_orders (misma transaccion). processed_by = auth.uid().
  -- ===================================================================
  update public.web_orders
    set status = 'imported',
        approved_at = now(),
        processed_order_id = p_order_id,
        processed_at = now(),
        processed_by = auth.uid()
    where id = p_web_order_id;

  -- ===================================================================
  -- n. RETORNO (misma forma JSON que la ruta idempotente)
  -- ===================================================================
  return jsonb_build_object(
    'success', true,
    'alreadyImported', false,
    'webOrderId', p_web_order_id,
    'orderId', p_order_id,
    'clientId', v_client_id,
    'clientCreated', v_client_created,
    'inventoryUpdated', v_updated,
    'inventoryWarnings', v_warnings,
    'pricingWarnings', v_pricing_warnings
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 5. Permisos: solo authenticated puede ejecutar; la funcion valida
--    is_admin() internamente. anon y public sin EXECUTE.
-- ---------------------------------------------------------------------
revoke all on function public.import_web_order(text, text, text, jsonb, jsonb)
  from public, anon;
grant execute on function public.import_web_order(text, text, text, jsonb, jsonb)
  to authenticated;

commit;
