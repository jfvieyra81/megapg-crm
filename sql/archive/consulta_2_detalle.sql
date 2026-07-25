-- =====================================================================
-- CONSULTA 2 — DETALLE de candidatos elegibles (extraida de 2026-07-24_reporte_reconciliacion_web_orders.sql)
-- Fecha extraccion: 2026-07-24 · Solo lectura · NO ejecutado.
-- Archivo independiente y autocontenido: no requiere las otras consultas.
-- SQL y CTEs sin cambios respecto al archivo original.
-- =====================================================================

-- =====================================================================
-- CONSULTA 2 de 4 — DETALLE de candidatos ELEGIBLES (maximo 5 por web_order)
--
--   Usa el conjunto NORMAL (cand): quedan EXCLUIDOS los orders ya
--   vinculados a otro web_order y los que tienen conflicto de notas. Ambos
--   se reportan aparte en la Consulta 4.
--
--   Orden dentro de cada web_order:
--     candidate_score DESC, date_difference_days ASC, candidate_order_id
--   Con +10 por señal forense, un EXACT_NOTE_LINK queda siempre primero.
--
--   ⚠️  candidate_score es una ayuda para revision manual; no constituye
--       una coincidencia confirmada. La señal de notas se expone SIEMPRE
--       como columna independiente, no solo dentro del score.
--
--   BLOQUE FORENSE (columnas nuevas de rev. 3.6.1):
--     order_notes                        texto completo de las notas del
--                                        order (= candidate_order_notes)
--     notes_contains_exact_web_order_id  las notas declaran EXACTAMENTE este
--                                        web_order (igualdad completa)
--     notes_contains_import_phrase       aparece el prefijo historico
--                                        'Importado de pedido web '
--     extracted_web_order_id_from_notes  id que las notas declaran
--     notes_link_conflict                las notas declaran OTRO web_order
--                                        (siempre false aqui: excluido)
--     forensic_match_type                clasificacion informativa
--
--   Señales heuristicas (sin cambios de significado):
--     same_normalized_phone, same_total, date_difference_days,
--     date_difference_days_vs_created, within_1_day, within_3_days,
--     same_product_set, same_total_and_phone, same_total_phone_and_close_date
--   ⚠️  same_product_set en NULL = "no se pudo calcular", no "no coinciden".
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
    o.client_id                         as candidate_client_id,
    c.data ->> 'name'                   as candidate_client_name,
    c.data ->> 'phone'                  as candidate_client_phone,
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
    o.status                            as candidate_order_status,
    o.data -> 'items'                   as candidate_order_items,
    o.data ->> 'notes'                  as candidate_order_notes,
    o.data ->> 'webOrderId'             as candidate_already_linked_web_order_id,
    (position('Importado de pedido web ' in coalesce(o.data ->> 'notes', '')) > 0)
                                        as notes_contains_import_phrase,
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
    w.negocio, w.encargado, w.phone_original, w.phone_normalized, w.direccion,
    w.total, w.created_at, w.approved_at, w.status, w.processed_order_id,
    w.items, w.notes,
    o.candidate_order_id,
    o.candidate_client_id,
    o.candidate_client_name,
    o.candidate_client_phone,
    o.candidate_order_total,
    o.candidate_order_date,
    o.candidate_order_status,
    o.candidate_order_items,
    o.candidate_order_notes,
    o.candidate_already_linked_web_order_id,
    o.notes_contains_import_phrase,
    o.extracted_web_order_id_from_notes,
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
         then abs(o.candidate_order_date - w.ref_date) end      as date_difference_days,
    case when w.created_date is not null and o.candidate_order_date is not null
         then abs(o.candidate_order_date - w.created_date) end  as date_difference_days_vs_created,
    case when w.product_set is not null and o.product_set is not null
         then (w.product_set = o.product_set) end              as same_product_set
  from wo_unlinked w
  join ord_norm o on true
),
cand_broad as (
  select
    ca.*,
    (ca.date_difference_days is not null and ca.date_difference_days <= 1) as within_1_day,
    (ca.date_difference_days is not null and ca.date_difference_days <= 3) as within_3_days,
    (coalesce(ca.same_total, false) and coalesce(ca.same_normalized_phone, false))
                                                                          as same_total_and_phone,
    (coalesce(ca.same_total, false) and coalesce(ca.same_normalized_phone, false)
      and ca.date_difference_days is not null and ca.date_difference_days <= 3)
                                                                          as same_total_phone_and_close_date,
    case
      when ca.candidate_already_linked_web_order_id is not null
       and btrim(ca.candidate_already_linked_web_order_id) <> ''
       and ca.candidate_already_linked_web_order_id = ca.web_order_id
        then 'STRUCTURED_WEB_ORDER_ID'
      when coalesce(ca.notes_contains_exact_web_order_id, false)
        then 'EXACT_NOTE_LINK'
      when coalesce(ca.notes_link_conflict, false)
        then 'NOTE_CONFLICT'
      when coalesce(ca.same_normalized_phone, false)
        or coalesce(ca.same_total, false)
        or (ca.date_difference_days is not null and ca.date_difference_days <= 3)
        then 'HEURISTIC_MATCH'
      else 'NONE'
    end                                                                   as forensic_match_type,
    ( case when coalesce(ca.notes_contains_exact_web_order_id, false) then 10 else 0 end
    + case when coalesce(ca.same_normalized_phone, false) then 4 else 0 end
    + case when coalesce(ca.same_total, false)            then 3 else 0 end
    + case
        when ca.date_difference_days is null then 0
        when ca.date_difference_days <= 1    then 2
        when ca.date_difference_days <= 3    then 1
        else 0
      end
    + case when coalesce(ca.same_normalized_phone, false)
            and coalesce(ca.same_product_set, false)     then 2 else 0 end
    )                                                                     as candidate_score
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
),
cand_ranked as (
  select c.*,
         row_number() over (
           partition by c.web_order_id
           order by c.candidate_score desc,
                    c.date_difference_days asc nulls last,
                    c.candidate_order_id
         ) as candidate_rank
  from cand c
)
select
  -- ---- web_order historico sin vinculo ----
  web_order_id,
  negocio,
  encargado,
  phone_original,
  phone_normalized,
  direccion,
  total,
  created_at,
  approved_at,
  status,
  processed_order_id,
  items,
  notes,                                   -- notas del WEB_ORDER
  -- ---- candidato ELEGIBLE (NO confirmado) ----
  candidate_rank,
  candidate_order_id,
  candidate_client_id,
  candidate_client_name,
  candidate_client_phone,
  candidate_order_total,
  candidate_order_date,
  candidate_order_status,
  candidate_order_items,
  candidate_order_notes,
  candidate_already_linked_web_order_id,   -- siempre null/vacio aqui
  -- ---- BLOQUE FORENSE (señal de notas) ----
  candidate_order_notes as order_notes,    -- mismo contenido, nombre explicito
  notes_contains_exact_web_order_id,
  notes_contains_import_phrase,
  extracted_web_order_id_from_notes,
  notes_link_conflict,                     -- siempre false aqui (excluido)
  forensic_match_type,
  -- ---- señales heuristicas independientes ----
  same_normalized_phone,
  same_total,
  date_difference_days,
  date_difference_days_vs_created,
  within_1_day,
  within_3_days,
  same_product_set,
  same_total_and_phone,
  same_total_phone_and_close_date,
  -- ⚠️ solo para ordenar; NO es una coincidencia confirmada
  candidate_score
from cand_ranked
where candidate_rank <= 5
order by web_order_id, candidate_rank;
