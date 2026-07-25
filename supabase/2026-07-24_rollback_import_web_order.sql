-- =====================================================================
-- ROLLBACK de la migracion  public.import_web_order(...)
-- Fecha: 2026-07-24  ·  Rama: sprint/web-order-idempotency
-- Diseno: supabase/2026-07-24_DISENO_import_web_order.md (rev. 3, §14)
--
-- ⚠️  NO EJECUTADO. Revierte la funcion y los indices creados por la
--     migracion. NO borra filas de negocio.
--
-- DECISION APROBADA (decision 3): este rollback CONSERVA las columnas de
-- trazabilidad processed_order_id / processed_at / processed_by.
--   Motivo: si la migracion estuvo aplicada y se importaron pedidos, esas
--   columnas contienen AUDITORIA (que pedido resulto de cada web_order,
--   cuando y quien lo proceso). Eliminarlas destruiria esa evidencia. Se
--   prefiere dejar columnas vacias/no usadas antes que perder auditoria.
--   Son columnas nullable e inertes sin la funcion; no estorban.
--
-- Al conservarlas, este rollback es INTENCIONALMENTE no-simetrico respecto
-- a la migracion (la migracion las agrega; el rollback NO las quita).
-- =====================================================================

begin;

-- 1. Funcion (firma exacta de 5 argumentos aprobada) ------------------
drop function if exists public.import_web_order(text, text, text, jsonb, jsonb);

-- 2. Indices creados por la migracion --------------------------------
drop index if exists public.orders_web_order_id_uq;
drop index if exists public.web_orders_processed_order_id_idx;

-- 3. Columnas processed_* : NO se eliminan (decision 3, ver cabecera).
--    Se conservan para no perder auditoria de imports ya realizados.
--    Si en el futuro se quisieran retirar de forma explicita y aceptando
--    la perdida de auditoria, seria en una migracion aparte y deliberada:
--      -- alter table public.web_orders
--      --   drop column if exists processed_order_id,
--      --   drop column if exists processed_at,
--      --   drop column if exists processed_by;

-- 4. No se tocan filas de negocio (orders/clients/inventory/web_orders).
--    Los pedidos ya importados conservan 'webOrderId' dentro de data
--    (inofensivo sin el indice unico).

commit;
