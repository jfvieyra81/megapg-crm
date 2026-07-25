-- =====================================================================
-- CONSULTA 4 — Posibles ambiguedades y contexto (extraida de 2026-07-24_reporte_reconciliacion_web_orders.sql)
-- Fecha extraccion: 2026-07-24 · Solo lectura · NO ejecutado.
-- Archivo independiente y autocontenido: no requiere las otras consultas.
-- SQL y CTEs sin cambios respecto al archivo original.
-- =====================================================================

-- =====================================================================
-- CONSULTA 4 de 4 — POSIBLES AMBIGUEDADES Y CONTEXTO
--   Siete categorias, etiquetadas en ambiguity_type:
--
--   -- heuristicas (conjunto ELEGIBLE) --
--   MULTIPLE_HIGH_SCORE        un web_order con >1 candidato elegible de
--                              score >= 7
--   ORDER_SHARED_BY_WEBORDERS  un mismo order elegible es candidato (top 5)
--                              de varios web_orders
--   SAME_TOTAL_DATE_DIFF_PHONE candidato elegible con mismo total y fecha
--                              cercana pero TELEFONO DISTINTO
--
--   -- estructural --
--   ORDER_ALREADY_LINKED_TO_OTHER_WEB_ORDER
--                              order que cumple >=1 señal pero YA tiene
--                              webOrderId de otra importacion. EXCLUIDO del
--                              ranking normal. Informativo.
--
--   -- forenses (señal de notas, rev. 3.6.1) --
--   EXACT_NOTE_LINK_MULTIPLE_ORDERS
--                              DOS O MAS orders declaran en sus notas el
--                              MISMO web_order. Solo uno puede ser el real.
--                              Es la ambiguedad forense mas grave.
--   NOTE_LINK_CONFLICT         order que parecia candidato (telefono/total/
--                              fecha) pero cuyas notas declaran OTRO
--                              web_order. EXCLUIDO del ranking normal.
--   NOTE_LINK_SHARED_ORDER     order cuyas notas lo ligan a un web_order
--                              concreto, pero que ademas compite como
--                              candidato heuristico de otros web_orders.
--                              Evita vincularlo al web_order equivocado.
--
--   ⚠️  Ninguna de estas filas reconcilia nada. Son señales de RIESGO y de
--       CONTEXTO para la decision humana.
-- =====================================================================
with wo_base as (
  select
    wo.id                                          as web_order_id,
    wo.negocio                                     as negocio,
    wo.phone                                       as phone_original,
    case
      when length(regexp_replace(coalesce(wo.phone, ''), '\D', '', 'g')) = 10
        then '1' || regexp_replace(coalesce(wo.phone, ''), '\D', '', 'g')
      else regexp_replace(coalesce(wo.phone, ''), '\D', '', 'g')
    end                                            as phone_normalized,
    wo.total                                       as total,
    wo.created_at                                  as created_at,
    wo.approved_at                                 as approved_at,
    wo.items                                       as items,
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
  left join public.clients c on c.id = o.client_id
  left join ord_products op on op.candidate_order_id = o.id
),
cand_all as (
  select
    w.web_order_id,
    o.candidate_order_id,
    o.candidate_client_id,
    o.candidate_client_name,
    o.candidate_order_total,
    o.candidate_order_date,
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
    case when w.product_set is not null and o.product_set is not null
         then (w.product_set = o.product_set) end              as same_product_set
  from wo_unlinked w
  join ord_norm o on true
),
cand_broad as (
  select
    ca.*,
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
-- 4a. Mas de un candidato ELEGIBLE de score alto para el mismo web_order
select
  'MULTIPLE_HIGH_SCORE'::text                     as ambiguity_type,
  cr.web_order_id                                 as web_order_id,
  null::text                                      as candidate_order_id,
  null::text                                      as candidate_already_linked_web_order_id,
  null::boolean                                   as same_normalized_phone,
  null::boolean                                   as same_total,
  min(cr.date_difference_days)::int               as date_difference_days,
  null::boolean                                   as same_product_set,
  null::boolean                                   as notes_contains_exact_web_order_id,
  null::boolean                                   as notes_link_conflict,
  null::text                                      as extracted_web_order_id_from_notes,
  max(cr.candidate_score)::int                    as candidate_score,
  (count(*)::text || ' candidatos elegibles con score>=7: '
    || string_agg(cr.candidate_order_id || ' (score ' || cr.candidate_score || ')',
                  ', ' order by cr.candidate_score desc, cr.candidate_order_id)
  )::text                                         as nota
from cand_ranked cr
where cr.candidate_score >= 7
group by cr.web_order_id
having count(*) > 1

union all

-- 4b. Un mismo order ELEGIBLE es candidato (top 5) de varios web_orders
select
  'ORDER_SHARED_BY_WEBORDERS'::text               as ambiguity_type,
  null::text                                      as web_order_id,
  cr.candidate_order_id                           as candidate_order_id,
  null::text                                      as candidate_already_linked_web_order_id,
  null::boolean                                   as same_normalized_phone,
  null::boolean                                   as same_total,
  min(cr.date_difference_days)::int               as date_difference_days,
  null::boolean                                   as same_product_set,
  null::boolean                                   as notes_contains_exact_web_order_id,
  null::boolean                                   as notes_link_conflict,
  null::text                                      as extracted_web_order_id_from_notes,
  max(cr.candidate_score)::int                    as candidate_score,
  ('order compartido como candidato por '
    || count(distinct cr.web_order_id)::text || ' web_orders: '
    || string_agg(distinct cr.web_order_id, ', ')
  )::text                                         as nota
from cand_ranked cr
where cr.candidate_rank <= 5
group by cr.candidate_order_id
having count(distinct cr.web_order_id) > 1

union all

-- 4c. Candidato ELEGIBLE con mismo total y fecha cercana pero TELEFONO DISTINTO
select
  'SAME_TOTAL_DATE_DIFF_PHONE'::text              as ambiguity_type,
  cr.web_order_id                                 as web_order_id,
  cr.candidate_order_id                           as candidate_order_id,
  cr.candidate_already_linked_web_order_id        as candidate_already_linked_web_order_id,
  cr.same_normalized_phone                        as same_normalized_phone,
  cr.same_total                                   as same_total,
  cr.date_difference_days::int                    as date_difference_days,
  cr.same_product_set                             as same_product_set,
  cr.notes_contains_exact_web_order_id            as notes_contains_exact_web_order_id,
  cr.notes_link_conflict                          as notes_link_conflict,
  cr.extracted_web_order_id_from_notes            as extracted_web_order_id_from_notes,
  cr.candidate_score::int                         as candidate_score,
  ('parecido enganoso · total=' || coalesce(cr.candidate_order_total::text, '(null)')
    || ' · cliente=' || coalesce(cr.candidate_client_name, '(sin nombre)')
    || ' · telefono NO coincide'
  )::text                                         as nota
from cand_ranked cr
where coalesce(cr.same_total, false)
  and cr.date_difference_days is not null
  and cr.date_difference_days <= 1
  and not coalesce(cr.same_normalized_phone, false)

union all

-- 4d. Order que cumple >=1 señal pero YA pertenece a OTRO web_order.
--     EXCLUIDO del ranking normal. Informativo.
select
  'ORDER_ALREADY_LINKED_TO_OTHER_WEB_ORDER'::text as ambiguity_type,
  cb.web_order_id                                 as web_order_id,
  cb.candidate_order_id                           as candidate_order_id,
  cb.candidate_already_linked_web_order_id        as candidate_already_linked_web_order_id,
  cb.same_normalized_phone                        as same_normalized_phone,
  cb.same_total                                   as same_total,
  cb.date_difference_days::int                    as date_difference_days,
  cb.same_product_set                             as same_product_set,
  cb.notes_contains_exact_web_order_id            as notes_contains_exact_web_order_id,
  cb.notes_link_conflict                          as notes_link_conflict,
  cb.extracted_web_order_id_from_notes            as extracted_web_order_id_from_notes,
  cb.candidate_score::int                         as candidate_score,
  ('EXCLUIDO del ranking normal: este order ya tiene webOrderId='
    || coalesce(cb.candidate_already_linked_web_order_id, '(null)')
    || ', que pertenece a otra importacion. Contexto; NO compite como candidato.'
  )::text                                         as nota
from cand_broad cb
where cb.is_linked_to_other_web_order

union all

-- 4e. DOS O MAS orders declaran en sus notas el MISMO web_order.
--     Solo uno puede ser el real: ambiguedad forense grave.
select
  'EXACT_NOTE_LINK_MULTIPLE_ORDERS'::text         as ambiguity_type,
  cb.web_order_id                                 as web_order_id,
  null::text                                      as candidate_order_id,
  null::text                                      as candidate_already_linked_web_order_id,
  null::boolean                                   as same_normalized_phone,
  null::boolean                                   as same_total,
  min(cb.date_difference_days)::int               as date_difference_days,
  null::boolean                                   as same_product_set,
  true                                            as notes_contains_exact_web_order_id,
  null::boolean                                   as notes_link_conflict,
  null::text                                      as extracted_web_order_id_from_notes,
  max(cb.candidate_score)::int                    as candidate_score,
  (count(distinct cb.candidate_order_id)::text
    || ' orders declaran ESTE web_order en sus notas: '
    || string_agg(distinct cb.candidate_order_id, ', ')
    || ' · solo uno puede ser el real; requiere decision humana'
  )::text                                         as nota
from cand_broad cb
where coalesce(cb.notes_contains_exact_web_order_id, false)
group by cb.web_order_id
having count(distinct cb.candidate_order_id) > 1

union all

-- 4f. Order que parecia candidato pero cuyas notas declaran OTRO web_order.
--     EXCLUIDO del ranking normal para este web_order.
select
  'NOTE_LINK_CONFLICT'::text                      as ambiguity_type,
  cb.web_order_id                                 as web_order_id,
  cb.candidate_order_id                           as candidate_order_id,
  cb.candidate_already_linked_web_order_id        as candidate_already_linked_web_order_id,
  cb.same_normalized_phone                        as same_normalized_phone,
  cb.same_total                                   as same_total,
  cb.date_difference_days::int                    as date_difference_days,
  cb.same_product_set                             as same_product_set,
  cb.notes_contains_exact_web_order_id            as notes_contains_exact_web_order_id,
  cb.notes_link_conflict                          as notes_link_conflict,
  cb.extracted_web_order_id_from_notes            as extracted_web_order_id_from_notes,
  cb.candidate_score::int                         as candidate_score,
  ('EXCLUIDO del ranking normal: sus notas declaran el web_order '
    || coalesce(cb.extracted_web_order_id_from_notes, '(no extraido)')
    || ', distinto del investigado. Explica por que un parecido no compite.'
  )::text                                         as nota
from cand_broad cb
where coalesce(cb.notes_link_conflict, false)

union all

-- 4g. Order ligado por notas a un web_order concreto, que ADEMAS compite
--     como candidato heuristico de varios web_orders. Riesgo de vincularlo
--     al web_order equivocado.
select
  'NOTE_LINK_SHARED_ORDER'::text                  as ambiguity_type,
  null::text                                      as web_order_id,
  cr.candidate_order_id                           as candidate_order_id,
  null::text                                      as candidate_already_linked_web_order_id,
  null::boolean                                   as same_normalized_phone,
  null::boolean                                   as same_total,
  min(cr.date_difference_days)::int               as date_difference_days,
  null::boolean                                   as same_product_set,
  true                                            as notes_contains_exact_web_order_id,
  null::boolean                                   as notes_link_conflict,
  (select max(cb3.web_order_id) from cand_broad cb3
     where cb3.candidate_order_id = cr.candidate_order_id
       and coalesce(cb3.notes_contains_exact_web_order_id, false))
                                                  as extracted_web_order_id_from_notes,
  max(cr.candidate_score)::int                    as candidate_score,
  ('sus notas lo ligan a un web_order concreto, pero compite como candidato de '
    || count(distinct cr.web_order_id)::text || ' web_orders: '
    || string_agg(distinct cr.web_order_id, ', ')
    || ' · vincularlo al equivocado es el riesgo'
  )::text                                         as nota
from cand_ranked cr
where cr.candidate_rank <= 5
  and exists (
    select 1 from cand_broad cb2
    where cb2.candidate_order_id = cr.candidate_order_id
      and coalesce(cb2.notes_contains_exact_web_order_id, false)
  )
group by cr.candidate_order_id
having count(distinct cr.web_order_id) > 1

order by ambiguity_type, web_order_id, candidate_order_id;
