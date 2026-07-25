-- =====================================================================
-- CONSULTA 3 — web_orders SIN candidato elegible (extraida de 2026-07-24_reporte_reconciliacion_web_orders.sql)
-- Fecha extraccion: 2026-07-24 · Solo lectura · NO ejecutado.
-- Archivo independiente y autocontenido: no requiere las otras consultas.
-- SQL y CTEs sin cambios respecto al archivo original.
-- =====================================================================

-- =====================================================================
-- CONSULTA 3 de 4 — web_orders SIN NINGUN CANDIDATO ELEGIBLE
--   Se evalua contra el mismo conjunto 'cand' de la Consulta 1, por lo que
--   este conteo coincide exactamente con 'without_candidates'.
--
--   ⚠️  Un web_order con COINCIDENCIA EXACTA EN NOTAS ya NO puede aparecer
--       aqui: la señal forense es criterio de admision a cand_broad y esos
--       candidatos son elegibles, asi que 'cand' nunca queda vacio para el.
--
--   Un web_order puede caer aqui aunque existan orders parecidos, si TODOS
--   fueron excluidos por pertenecer a otra importacion o por conflicto de
--   notas. Las dos columnas de descarte explican cual fue el motivo.
--
--   Estos casos NO son reconciliables con los datos disponibles: o el
--   pedido nunca se creo en el CRM, o se borro, o los datos cambiaron.
--   Requieren decision humana explicita (dejarlos sin vinculo es valido).
-- =====================================================================
with wo_base as (
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
    wo.direccion                                   as direccion,
    wo.total                                       as total,
    wo.created_at                                  as created_at,
    wo.approved_at                                 as approved_at,
    wo.status                                      as status,
    to_jsonb(wo) ->> 'processed_order_id'          as processed_order_id,
    wo.items                                       as items,
    wo.notes                                       as notes,
    coalesce(wo.approved_at, wo.created_at)::date   as ref_date,
    wo.created_at::date                            as created_date
  from public.web_orders wo
  where wo.status = 'imported'
    and not exists (
      select 1 from public.orders o
      where o.data ->> 'webOrderId' = wo.id::text
    )
    and (
      to_jsonb(wo) ->> 'processed_order_id' is null
      or not exists (
        select 1 from public.orders o2
        where o2.id = to_jsonb(wo) ->> 'processed_order_id'
      )
    )
),
wo_products as (
  select b.web_order_id,
         array_agg(distinct p.pid order by p.pid) as product_set
  from wo_base b
  cross join lateral (
    select it ->> 'productId' as pid
    from jsonb_array_elements(
           case when jsonb_typeof(b.items) = 'array' then b.items else '[]'::jsonb end
         ) it
    where coalesce(it ->> 'productId', '') <> ''
  ) p
  group by b.web_order_id
),
wo_unlinked as (
  select b.*, wp.product_set
  from wo_base b
  left join wo_products wp on wp.web_order_id = b.web_order_id
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
cand_all as (
  select
    w.web_order_id,
    o.candidate_order_id,
    o.candidate_already_linked_web_order_id,
    ( o.extracted_web_order_id_from_notes is not null
      and o.extracted_web_order_id_from_notes = w.web_order_id )
                                                               as notes_contains_exact_web_order_id,
    ( o.extracted_web_order_id_from_notes is not null
      and o.extracted_web_order_id_from_notes <> w.web_order_id )
                                                               as notes_link_conflict,
    ( o.candidate_already_linked_web_order_id is not null
      and btrim(o.candidate_already_linked_web_order_id) <> ''
      and o.candidate_already_linked_web_order_id <> w.web_order_id )
                                                               as is_linked_to_other_web_order,
    (o.candidate_client_phone_normalized is not null
      and o.candidate_client_phone_normalized <> ''
      and o.candidate_client_phone_normalized = w.phone_normalized
      and w.phone_normalized <> '')                            as same_normalized_phone,
    (w.total is not null and o.candidate_order_total is not null
      and abs(o.candidate_order_total - w.total) <= 0.01)       as same_total,
    case when w.ref_date is not null and o.candidate_order_date is not null
         then abs(o.candidate_order_date - w.ref_date) end      as date_difference_days
  from wo_unlinked w
  join ord_norm o on true
),
cand_broad as (
  select ca.*
  from cand_all ca
  where coalesce(ca.notes_contains_exact_web_order_id, false)
     or coalesce(ca.same_normalized_phone, false)
     or coalesce(ca.same_total, false)
     or (ca.date_difference_days is not null and ca.date_difference_days <= 3)
),
cand as (
  select cb.*
  from cand_broad cb
  where not cb.is_linked_to_other_web_order
    and not coalesce(cb.notes_link_conflict, false)
)
select
  w.web_order_id,
  w.negocio,
  w.encargado,
  w.phone_original,
  w.phone_normalized,
  w.direccion,
  w.total,
  w.created_at,
  w.approved_at,
  w.status,
  w.processed_order_id,
  w.items,
  w.notes,
  'sin candidatos ELEGIBLES: ni señal en notas, ni telefono, ni total, ni fecha (<=3 dias)'::text
                                                                          as motivo,
  -- ¿habia parecidos, pero excluidos? Dos motivos posibles:
  (select count(*) from cand_broad cb
     where cb.web_order_id = w.web_order_id
       and cb.is_linked_to_other_web_order)::int                          as descartados_por_ya_vinculados,
  (select count(*) from cand_broad cb
     where cb.web_order_id = w.web_order_id
       and coalesce(cb.notes_link_conflict, false))::int                   as descartados_por_conflicto_de_notas
from wo_unlinked w
where not exists (
  select 1 from cand c where c.web_order_id = w.web_order_id
)
order by w.created_at desc;
