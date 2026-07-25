-- =====================================================================
-- CONSULTA 1 — RESUMEN (extraida de 2026-07-24_reporte_reconciliacion_web_orders.sql)
-- Fecha extraccion: 2026-07-24 · Solo lectura · NO ejecutado.
-- Archivo independiente y autocontenido: no requiere las otras consultas.
-- SQL y CTEs sin cambios respecto al archivo original.
-- =====================================================================

-- =====================================================================
-- CONSULTA 1 de 4 — RESUMEN
--   total_imported_without_link          : cuantos web_orders sin vinculo
--   with_at_least_one_candidate          : cuantos tienen >=1 candidato
--                                          ELEGIBLE
--   without_candidates                   : cuantos no tienen ninguno elegible
--   with_multiple_high_score_candidates  : cuantos tienen >=2 candidatos
--                                          elegibles de score alto
--   with_exact_note_link                 : cuantos tienen >=1 order cuyas
--                                          notas declaran ESTE web_order
--   without_exact_note_link              : cuantos NO tienen esa señal
--                                          (with_exact_note_link + este = total)
--   with_note_conflict                   : cuantos tienen >=1 order parecido
--                                          cuyas notas declaran OTRO web_order
--
--   Las tres metricas de notas se cuentan sobre cand_broad (conjunto amplio),
--   porque los conflictos estan excluidos de cand por definicion y aqui
--   interesa medir la EVIDENCIA disponible, no la elegibilidad.
--
--   "score alto" = candidate_score >= 7, bajo la formula de rev. 3.6.1.
--   Es solo una ayuda de revision manual, no una prueba. Nota: con +10 por
--   señal forense, cualquier EXACT_NOTE_LINK supera el umbral por si solo.
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
    -- NOTAS DEL ORDER: path auditado = orders.data ->> 'notes' (App.tsx:265)
    o.data ->> 'notes'                  as candidate_order_notes,
    o.data ->> 'webOrderId'             as candidate_already_linked_web_order_id,
    -- ¿aparece el prefijo historico de WebOrders.tsx:142?
    (position('Importado de pedido web ' in coalesce(o.data ->> 'notes', '')) > 0)
                                        as notes_contains_import_phrase,
    -- id que las NOTAS declaran: primer token sin espacios tras el prefijo.
    -- Guardado por CASE: si el prefijo no esta, no se extrae nada (NULL).
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
    -- COINCIDENCIA EXACTA EN NOTAS: igualdad de cadenas completas, no
    -- subcadena. Por eso 'wo_123' NUNCA coincide con 'wo_1234'.
    ( o.extracted_web_order_id_from_notes is not null
      and o.extracted_web_order_id_from_notes = w.web_order_id )
                                                               as notes_contains_exact_web_order_id,
    -- CONFLICTO DE NOTAS: las notas declaran explicitamente OTRO web_order.
    ( o.extracted_web_order_id_from_notes is not null
      and o.extracted_web_order_id_from_notes <> w.web_order_id )
                                                               as notes_link_conflict,
    -- Elegibilidad estructural: TRUE si el order ya pertenece a OTRO web_order.
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
-- CONJUNTO AMPLIO: incluye ya-vinculados y conflictos de notas.
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
    -- Clasificacion INFORMATIVA (no reconcilia ni autoriza nada).
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
    -- candidate_score (rev. 3.6.1): +10 señal forense de notas; fecha
    -- mutuamente excluyente; productos solo con telefono. Maximo = 21.
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
  -- ADMISION: basta UNA señal. La coincidencia exacta en notas admite al
  -- candidato aunque NO coincidan telefono, total ni fecha.
  where coalesce(ca.notes_contains_exact_web_order_id, false)
     or coalesce(ca.same_normalized_phone, false)
     or coalesce(ca.same_total, false)
     or (ca.date_difference_days is not null and ca.date_difference_days <= 3)
),
-- CONJUNTO NORMAL / ELEGIBLE: excluye ya-vinculados y conflictos de notas.
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
  (select count(*) from wo_unlinked)                            as total_imported_without_link,
  (select count(distinct web_order_id) from cand)               as with_at_least_one_candidate,
  (select count(*) from wo_unlinked w
     where not exists (select 1 from cand c where c.web_order_id = w.web_order_id))
                                                                as without_candidates,
  (select count(*) from (
     select web_order_id
     from cand
     where candidate_score >= 7
     group by web_order_id
     having count(*) > 1
   ) m)                                                         as with_multiple_high_score_candidates,
  -- ---- señal forense de notas ----
  (select count(distinct web_order_id) from cand_broad
     where notes_contains_exact_web_order_id)                   as with_exact_note_link,
  (select count(*) from wo_unlinked w
     where not exists (select 1 from cand_broad cb
                       where cb.web_order_id = w.web_order_id
                         and cb.notes_contains_exact_web_order_id))
                                                                as without_exact_note_link,
  (select count(distinct web_order_id) from cand_broad
     where notes_link_conflict)                                 as with_note_conflict;
