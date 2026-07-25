-- =====================================================================
-- REPORTE READ-ONLY — Reconciliacion historica de web_orders 'imported'
--                     SIN vinculo persistente verificable
-- Fecha: 2026-07-24  ·  Rama: sprint/web-order-idempotency
-- Revision: 3.6.1 (señal forense desde las notas del order)
-- Contexto: Checkpoint 3.6.1. El precheck
--   (supabase/2026-07-24_precheck_duplicados.sql) reporto:
--     schema_integrity_ok = true
--     imported_sin_vinculo = 13   → historical_reconciliation_required = true
--     ok_para_migrar = false
--
-- ⚠️  ESTE ARCHIVO ES DE SOLO LECTURA. Contiene unicamente SELECT, WITH y
--     comentarios. No modifica datos ni esquema. No crea vinculos.
--
-- ⚠️  EL RESULTADO REQUIERE DECISION HUMANA. Este reporte no propone
--     escrituras, no ordena vincular nada y no debe automatizarse.
--     Ninguna señal de este reporte, incluida la señal forense de notas,
--     realiza o autoriza una reconciliacion por si sola.
--
-- ---------------------------------------------------------------------
-- SEÑAL FORENSE DESDE LAS NOTAS (rev. 3.6.1) — origen y path auditados
--
--   Codigo fuente de la señal: src/components/WebOrders.tsx, linea 142.
--   El flujo viejo construia las notas del pedido CRM asi:
--
--     notes: `Importado de pedido web ${wo.id}${wo.pago ? ` • Pago: ${wo.pago}` : ""}`
--
--   PATH EXACTO del campo (no asumido, verificado en el codigo):
--     src/App.tsx linea 265, serializeForCloud:
--       if (table === "orders") return { id, client_id, status, paid_date,
--                                        data: item, updated_at }
--     El objeto Order completo se guarda en la columna `data`, por lo que
--     `notes` NO es columna de primer nivel: vive en
--
--         public.orders.data ->> 'notes'
--
--   PREFIJO HISTORICO LITERAL que se busca:  'Importado de pedido web '
--   (con el espacio final; el id del pedido web viene inmediatamente despues)
--
--   PROTECCION CONTRA COINCIDENCIAS PARCIALES:
--   NO se hace una busqueda de subcadena del id (eso confundiria 'wo_123'
--   con 'wo_1234'). En su lugar se EXTRAE el id que las notas declaran —
--   el primer token sin espacios que sigue al prefijo historico — y se
--   compara por IGUALDAD EXACTA contra el web_order evaluado. La igualdad
--   de cadenas completas hace imposible la coincidencia parcial.
--   Ventaja adicional: el id nunca entra en una expresion regular, asi que
--   no hay riesgo por metacaracteres dentro del id.
--
--   Nota: si las notas contienen el prefijo mas de una vez, se usa la
--   primera ocurrencia (position() devuelve la primera).
-- ---------------------------------------------------------------------
--
-- ⚠️  NO EXISTE NINGUN VINCULO AUTOMATICO. El codigo viejo marcaba el
--     web_order como 'imported' en una llamada REST SEPARADA de la creacion
--     del pedido, y NO persistio 'webOrderId' en orders. La señal de notas
--     es un RASTRO de texto, no un vinculo estructural: pudo editarse a mano
--     despues, y por eso sigue requiriendo confirmacion humana.
--
-- ⚠️  MONTO, TELEFONO Y FECHA NO BASTAN POR SI SOLOS. Dos pedidos del mismo
--     cliente por el mismo total en dias cercanos son indistinguibles con
--     los datos disponibles. Todo lo que este reporte llama "candidato" es
--     una PISTA para revision humana, nunca una coincidencia confirmada.
--
-- ---------------------------------------------------------------------
-- DOS CONJUNTOS DE CANDIDATOS
--
--   cand_broad  CONJUNTO AMPLIO. Todo order que cumple >=1 señal de
--               admision, INCLUYENDO los que ya tienen webOrderId propio y
--               los que tienen conflicto de notas. Se usa para las
--               categorias informativas de la consulta de ambiguedades.
--
--   cand        CONJUNTO NORMAL / ELEGIBLE. Es cand_broad menos:
--                 (a) orders ya vinculados a OTRO web_order
--                     (is_linked_to_other_web_order);
--                 (b) orders cuyas notas declaran OTRO web_order
--                     (notes_link_conflict).
--               Lo usan: Consulta 1, Consulta 2, Consulta 3,
--               MULTIPLE_HIGH_SCORE, ORDER_SHARED_BY_WEBORDERS,
--               SAME_TOTAL_DATE_DIFF_PHONE y NOTE_LINK_SHARED_ORDER.
--
--   SEÑALES DE ADMISION a cand_broad (basta UNA):
--     - notes_contains_exact_web_order_id  ← admite aunque NO coincidan
--                                            telefono, total ni fecha
--     - same_normalized_phone
--     - same_total
--     - date_difference_days <= 3
--
--   Los conflictos de notas (notes_link_conflict) entran a cand_broad solo
--   si ADEMAS cumplen una señal heuristica. Es deliberado: de otro modo cada
--   order historico con notas de importacion apareceria como "conflicto"
--   frente a los 13 web_orders, generando ruido sin valor. Asi, la categoria
--   NOTE_LINK_CONFLICT reporta exactamente los casos utiles: los que
--   PARECIAN candidatos pero cuyas notas apuntan a otro pedido web.
-- ---------------------------------------------------------------------
--
-- FORMULA DE candidate_score (rev. 3.6.1) — maximo posible = 21
--   +10 notes_contains_exact_web_order_id   ← señal forense, la mas fuerte
--   +4  same_normalized_phone
--   +3  same_total
--   +2 / +1 / 0  fecha, MUTUAMENTE EXCLUYENTE (un solo CASE):
--                <=1 dia → 2 ; <=3 dias → 1 ; resto → 0
--   +2  same_product_set PERO SOLO si same_normalized_phone tambien es TRUE.
--
--   ⚠️  La coincidencia en notas se expone SIEMPRE como columna booleana
--       independiente (notes_contains_exact_web_order_id) y como
--       forensic_match_type. NO queda escondida detras del score.
--
-- FORENSIC_MATCH_TYPE — clasificacion INFORMATIVA, en orden de prioridad:
--   STRUCTURED_WEB_ORDER_ID  el order tiene webOrderId estructurado igual al
--                            web_order evaluado. Por construccion de wo_base
--                            esto es inalcanzable para estos 13 casos (se
--                            excluyen los que ya tienen ese vinculo); se
--                            conserva por correccion del reporte.
--   EXACT_NOTE_LINK          las notas declaran EXACTAMENTE este web_order
--   NOTE_CONFLICT            las notas declaran OTRO web_order
--   HEURISTIC_MATCH          sin señal de notas, pero coincide telefono,
--                            total o fecha (<=3 dias)
--   NONE                     ninguna de las anteriores
--   ⚠️  Esta clasificacion NO es una reconciliacion ni la autoriza.
--
-- NOTAS TECNICAS
--  a) 'processed_order_id' se lee via to_jsonb(wo) ->> 'processed_order_id'
--     porque la migracion NO esta aplicada todavia y esa columna aun no
--     existe. Con to_jsonb el reporte corre igual antes y despues.
--  b) orders NO tiene columna created_at. Se usan solo campos auditados:
--     orders.updated_at, orders.paid_date, orders.data->>'date',
--     orders.data->>'created'.
--  c) Todos los casts desde JSON van protegidos por CASE + patron regex,
--     para que un valor malformado no haga fallar el reporte completo.
--  d) FECHA DE REFERENCIA del web_order = coalesce(approved_at, created_at),
--     porque el flujo viejo creaba el pedido con la fecha de IMPORTACION.
--  e) Telefono normalizado: solo digitos y, si quedan 10, se antepone '1'.
--  f) same_product_set compara SOLO el conjunto de productId distintos.
--     NO compara cantidades (fuera de alcance).
--  g) El bloque WITH se REPITE, identico, en las 4 consultas: cada sentencia
--     es independiente y los CTE no se comparten entre ellas.
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
