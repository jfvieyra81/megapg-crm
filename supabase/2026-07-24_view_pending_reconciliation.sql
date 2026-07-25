-- =====================================================================
-- VISTA DE MANTENIMIENTO — public.vw_web_orders_pending_reconciliation
-- Fecha: 2026-07-24  ·  Rama: sprint/web-order-idempotency
-- Checkpoint 3 (Release Candidate) — capa permanente de soporte
--
-- Proposito: superficie ESTABLE de soporte para ver, en cualquier momento,
-- que pedidos web historicos siguen sin pedido del CRM asociado. Sustituye
-- la necesidad de volver a correr las consultas forenses (archivadas en
-- sql/archive/) para una consulta rutinaria.
--
-- ⚠️  DEPENDENCIA DURA DE ORDEN: esta vista referencia
--     public.web_orders.processed_order_id, columna que crea la migracion
--     2026-07-24_import_web_order.sql. DEBE crearse DESPUES de la migracion.
--     Si se crea antes, falla con "column does not exist" (error claro y
--     seguro, no destructivo).
--
-- ⚠️  NO RECONCILIA NADA. Es de solo lectura por naturaleza (una vista).
--     No enlaza, no escribe, no propone escrituras. Mostrar un "mejor
--     candidato" NO es afirmar que sea el correcto: la evidencia disponible
--     es heuristica y la decision es humana (ver docs/RECONCILIACION_HISTORICA.md).
--
-- IDEMPOTENTE: create or replace view. Se puede correr varias veces.
--
-- LOGICA: identica a la revision 3.6.1 del reporte forense
-- (sql/archive/2026-07-24_reporte_reconciliacion_web_orders.sql). No se
-- cambio ninguna definicion: misma normalizacion de telefono, mismas señales
-- de admision, mismas exclusiones de elegibilidad y misma formula de score.
-- Si algun dia se cambia una, hay que cambiarla en los dos lugares.
--
-- SEGURIDAD: se crea con security_invoker = true para que las politicas RLS
-- del usuario que consulta SI apliquen. Sin eso, una vista corre con los
-- permisos de su dueño y se convertiria en un agujero que expone web_orders
-- por encima de RLS (el proyecto cerro RLS en 2026-07-13; no lo reabrimos).
-- Requiere PostgreSQL 15+. Ademas se revoca a public/anon explicitamente.
-- =====================================================================

create or replace view public.vw_web_orders_pending_reconciliation
with (security_invoker = true) as
with unlinked as (
  -- Pedidos web 'imported' SIN vinculo verificable (misma definicion que wo_base)
  select
    wo.id                                          as web_order_id,
    wo.negocio                                     as negocio,
    wo.encargado                                   as encargado,
    wo.phone                                       as phone_original,
    case
      when length(regexp_replace(coalesce(wo.phone, ''), '\D', '', 'g')) = 10
        then '1' || regexp_replace(coalesce(wo.phone, ''), '\D', '', 'g')
      else regexp_replace(coalesce(wo.phone, ''), '\D', '', 'g')
    end                                            as phone_normalized,
    wo.total                                       as total,
    wo.created_at                                  as created_at,
    wo.approved_at                                 as approved_at,
    wo.status                                      as status,
    wo.processed_order_id                          as processed_order_id,
    wo.items                                       as items,
    coalesce(wo.approved_at, wo.created_at)::date   as ref_date
  from public.web_orders wo
  where wo.status = 'imported'
    and not exists (
      select 1 from public.orders o
      where o.data ->> 'webOrderId' = wo.id::text
    )
    and (
      wo.processed_order_id is null
      or not exists (
        select 1 from public.orders o2
        where o2.id = wo.processed_order_id
      )
    )
),
wo_products as (
  select u.web_order_id,
         array_agg(distinct p.pid order by p.pid) as product_set
  from unlinked u
  cross join lateral (
    select it ->> 'productId' as pid
    from jsonb_array_elements(
           case when jsonb_typeof(u.items) = 'array' then u.items else '[]'::jsonb end
         ) it
    where coalesce(it ->> 'productId', '') <> ''
  ) p
  group by u.web_order_id
),
wo_full as (
  select u.*, wp.product_set
  from unlinked u
  left join wo_products wp on wp.web_order_id = u.web_order_id
),
ord_products as (
  select o.id as candidate_order_id,
         array_agg(distinct p.pid order by p.pid) as product_set
  from public.orders o
  cross join lateral (
    select it ->> 'productId' as pid
    from jsonb_array_elements(
           case when jsonb_typeof(o.data -> 'items') = 'array'
                then o.data -> 'items' else '[]'::jsonb end
         ) it
    where coalesce(it ->> 'productId', '') <> ''
  ) p
  group by o.id
),
ord_norm as (
  select
    o.id                                as candidate_order_id,
    c.data ->> 'name'                   as candidate_client_name,
    case
      when length(regexp_replace(coalesce(c.data ->> 'phone', ''), '\D', '', 'g')) = 10
        then '1' || regexp_replace(coalesce(c.data ->> 'phone', ''), '\D', '', 'g')
      else regexp_replace(coalesce(c.data ->> 'phone', ''), '\D', '', 'g')
    end                                 as candidate_client_phone_normalized,
    case when (o.data ->> 'total') ~ '^-?[0-9]+(\.[0-9]+)?$'
         then (o.data ->> 'total')::numeric
    end                                 as candidate_order_total,
    coalesce(
      case when (o.data ->> 'date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           then to_date(substring(o.data ->> 'date' from 1 for 10), 'YYYY-MM-DD')
      end,
      case when (o.data ->> 'created') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}'
           then to_date(substring(o.data ->> 'created' from 1 for 10), 'YYYY-MM-DD')
      end,
      o.paid_date,
      o.updated_at::date
    )                                   as candidate_order_date,
    o.data ->> 'webOrderId'             as candidate_already_linked_web_order_id,
    -- Señal forense: prefijo historico escrito por WebOrders.tsx:142.
    -- Se EXTRAE el id declarado y luego se compara por igualdad exacta,
    -- por lo que 'wo_123' nunca coincide con 'wo_1234'.
    case when position('Importado de pedido web ' in coalesce(o.data ->> 'notes', '')) > 0
         then nullif(
                substring(
                  btrim(
                    substring(
                      coalesce(o.data ->> 'notes', '')
                      from position('Importado de pedido web ' in coalesce(o.data ->> 'notes', ''))
                           + length('Importado de pedido web ')
                    )
                  )
                  from '^[^[:space:]]+'
                ), '')
    end                                 as extracted_web_order_id_from_notes,
    op.product_set                      as product_set
  from public.orders o
  left join public.clients c   on c.id = o.client_id
  left join ord_products op    on op.candidate_order_id = o.id
),
cand as (
  select
    w.web_order_id,
    o.candidate_order_id,
    o.candidate_client_name,
    ( o.extracted_web_order_id_from_notes is not null
      and o.extracted_web_order_id_from_notes = w.web_order_id )
                                                               as notes_contains_exact_web_order_id,
    (o.candidate_client_phone_normalized is not null
      and o.candidate_client_phone_normalized <> ''
      and o.candidate_client_phone_normalized = w.phone_normalized
      and w.phone_normalized <> '')                            as same_normalized_phone,
    (w.total is not null and o.candidate_order_total is not null
      and abs(o.candidate_order_total - w.total) <= 0.01)       as same_total,
    case when w.ref_date is not null and o.candidate_order_date is not null
         then abs(o.candidate_order_date - w.ref_date) end      as date_difference_days,
    case when w.product_set is not null and o.product_set is not null
         then (w.product_set = o.product_set) end              as same_product_set,
    -- score identico a rev. 3.6.1 (maximo 21)
    ( case when ( o.extracted_web_order_id_from_notes is not null
                  and o.extracted_web_order_id_from_notes = w.web_order_id )
           then 10 else 0 end
    + case when (o.candidate_client_phone_normalized is not null
                 and o.candidate_client_phone_normalized <> ''
                 and o.candidate_client_phone_normalized = w.phone_normalized
                 and w.phone_normalized <> '')
           then 4 else 0 end
    + case when (w.total is not null and o.candidate_order_total is not null
                 and abs(o.candidate_order_total - w.total) <= 0.01)
           then 3 else 0 end
    + case
        when w.ref_date is null or o.candidate_order_date is null then 0
        when abs(o.candidate_order_date - w.ref_date) <= 1       then 2
        when abs(o.candidate_order_date - w.ref_date) <= 3       then 1
        else 0
      end
    + case when (o.candidate_client_phone_normalized is not null
                 and o.candidate_client_phone_normalized <> ''
                 and o.candidate_client_phone_normalized = w.phone_normalized
                 and w.phone_normalized <> '')
            and coalesce(
                  case when w.product_set is not null and o.product_set is not null
                       then (w.product_set = o.product_set) end, false)
           then 2 else 0 end
    )                                                          as candidate_score
  from wo_full w
  join ord_norm o on true
  -- ADMISION (basta una señal): notas exactas, telefono, total, o fecha <=3 dias
  where (
      ( o.extracted_web_order_id_from_notes is not null
        and o.extracted_web_order_id_from_notes = w.web_order_id )
      or (o.candidate_client_phone_normalized is not null
          and o.candidate_client_phone_normalized <> ''
          and o.candidate_client_phone_normalized = w.phone_normalized
          and w.phone_normalized <> '')
      or (w.total is not null and o.candidate_order_total is not null
          and abs(o.candidate_order_total - w.total) <= 0.01)
      or (w.ref_date is not null and o.candidate_order_date is not null
          and abs(o.candidate_order_date - w.ref_date) <= 3)
    )
    -- ELEGIBILIDAD: fuera los orders ya vinculados a OTRO web_order
    and not (
      o.candidate_already_linked_web_order_id is not null
      and btrim(o.candidate_already_linked_web_order_id) <> ''
      and o.candidate_already_linked_web_order_id <> w.web_order_id
    )
    -- ELEGIBILIDAD: fuera los orders cuyas notas declaran OTRO web_order
    and not (
      o.extracted_web_order_id_from_notes is not null
      and o.extracted_web_order_id_from_notes <> w.web_order_id
    )
),
best as (
  select c.*,
         row_number() over (
           partition by c.web_order_id
           order by c.candidate_score desc,
                    c.date_difference_days asc nulls last,
                    c.candidate_order_id
         ) as rn
  from cand c
)
select
  w.web_order_id,
  w.negocio,
  w.created_at                            as fecha,
  w.total,
  w.status,
  -- Mejor candidato ELEGIBLE, si existe. NO es una coincidencia confirmada.
  b.candidate_order_id                    as mejor_candidato_order_id,
  b.candidate_client_name                 as mejor_candidato_cliente,
  b.candidate_score                       as score,
  b.notes_contains_exact_web_order_id     as candidato_con_vinculo_en_notas,
  b.same_normalized_phone                 as candidato_mismo_telefono,
  b.same_total                            as candidato_mismo_total,
  b.date_difference_days                  as candidato_dias_de_diferencia,
  b.same_product_set                      as candidato_mismos_productos,
  case
    when b.candidate_order_id is null then 'LEGACY_UNRECONCILED'
    else 'PENDIENTE_REVISION_MANUAL'
  end                                     as motivo,
  case
    when b.candidate_order_id is null
      then 'Sin evidencia: ningun order coincide por notas, telefono, total ni fecha (<=3 dias). No reconciliable con los datos disponibles.'
    when b.notes_contains_exact_web_order_id
      then 'Existe un order cuyas notas declaran este pedido web. Evidencia fuerte, pero el texto pudo editarse: requiere confirmacion humana.'
    else 'Existe un candidato solo por heuristica (telefono/total/fecha/productos). La evidencia NO es concluyente: requiere revision humana.'
  end                                     as motivo_detalle
from wo_full w
left join best b
  on b.web_order_id = w.web_order_id
 and b.rn = 1
order by
  case when b.candidate_order_id is null then 0 else 1 end,  -- primero los sin candidato
  b.candidate_score desc nulls last,
  w.created_at desc;

comment on view public.vw_web_orders_pending_reconciliation is
  'Pedidos web historicos marcados imported que siguen sin pedido del CRM asociado. Solo lectura, para soporte. mejor_candidato_order_id y score son HEURISTICOS: no confirman ninguna relacion y no autorizan reconciliar. Ver docs/RECONCILIACION_HISTORICA.md. Logica espejo de la rev. 3.6.1 del reporte forense en sql/archive/.';

-- Permisos: nunca a anon. La vista usa security_invoker, asi que RLS aplica
-- al usuario que consulta (un authenticated no-admin no vera filas).
revoke all on public.vw_web_orders_pending_reconciliation from public, anon;
grant select on public.vw_web_orders_pending_reconciliation to authenticated;
