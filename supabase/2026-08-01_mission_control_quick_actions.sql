-- =============================================================================
-- Mission Control — Quick Actions (Sprint 02)
-- CRM v5.29.0
-- Fecha: 2026-08-01
-- Autor: Claude (asistente IA), sesión de implementación con José — Dulce Sabor LLC
-- =============================================================================
-- Agrega 2 columnas nullable a mission_control_tasks (creada en
-- 2026-07-31_mission_control.sql, que NO se toca) para soportar el botón
-- "Abrir" de una tarea:
--   action_type:   'tab' | 'url' | null
--   action_target: tab id fijo del CRM (si action_type='tab') o URL http(s)
--                  completa (si action_type='url') | null
--
-- Alcance aprobado por José (Sprint 02, decisión #4/#7): sin cambios de RLS,
-- sin tablas nuevas, sin tocar la migración original. Columnas nullable con
-- default null → las 0 filas existentes (o las que ya tenga José hoy) quedan
-- exactamente igual: sin acción, sin botón "Abrir" (ver MissionControl.tsx).
--
-- La validación real de "action_target pertenece a la lista fija de tabs" y
-- "URL empieza con http(s)://" vive en la capa de app (src/lib/missionControl.ts
-- y src/components/MissionControl.tsx) — igual que el máximo de 3 tareas/día,
-- que tampoco es un constraint SQL. Aquí solo se garantiza la invariante
-- mínima de integridad: no se puede quedar en un estado a medias (action_type
-- sin action_target, o viceversa).
--
-- Idempotencia: "add column if not exists" + policy de check con
-- drop-if-exists antes de re-crear. Envuelto en una transacción (BEGIN/COMMIT).
--
-- Cómo correrlo: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- =============================================================================

BEGIN;

alter table public.mission_control_tasks
  add column if not exists action_type text,
  add column if not exists action_target text;

-- drop-if-exists porque "add constraint if not exists" no existe en Postgres
-- para checks con nombre — mismo patrón de idempotencia que las policies en
-- 2026-07-31_mission_control.sql.
alter table public.mission_control_tasks
  drop constraint if exists mission_control_tasks_action_type_check;
alter table public.mission_control_tasks
  add constraint mission_control_tasks_action_type_check
  check (action_type is null or action_type in ('tab','url'));

alter table public.mission_control_tasks
  drop constraint if exists mission_control_tasks_action_complete_check;
alter table public.mission_control_tasks
  add constraint mission_control_tasks_action_complete_check
  check (
    (action_type is null and action_target is null)
    or (action_type is not null and action_target is not null and action_target <> '')
  );

-- ─── Verificación ────────────────────────────────────────────────────────
select column_name, is_nullable, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'mission_control_tasks'
  and column_name in ('action_type','action_target');
-- esperado: 2 filas, ambas is_nullable = YES

select count(*) as constraints_creados
from pg_constraint
where conrelid = 'public.mission_control_tasks'::regclass
  and conname in ('mission_control_tasks_action_type_check','mission_control_tasks_action_complete_check');
-- esperado: 2

COMMIT;
