-- =====================================================================
-- ROLLBACK de la vista public.vw_web_orders_pending_reconciliation
-- Fecha: 2026-07-24  ·  Rama: sprint/web-order-idempotency
--
-- Revierte SOLO la vista. Una vista no contiene datos: eliminarla no borra
-- ni modifica ninguna fila de web_orders, orders, clients ni inventory.
--
-- IDEMPOTENTE: drop ... if exists. Se puede correr varias veces.
--
-- Nota de orden: si se va a revertir TODO el despliegue, esta vista debe
-- eliminarse ANTES del rollback de la migracion, porque depende de la
-- columna web_orders.processed_order_id. (En la practica el rollback de la
-- migracion conserva esa columna por decision de auditoria, asi que el orden
-- no rompe nada; se documenta por claridad.)
-- =====================================================================

drop view if exists public.vw_web_orders_pending_reconciliation;
