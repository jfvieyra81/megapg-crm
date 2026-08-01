-- =============================================================================
-- Mission Control Schema v1.0
-- CRM v5.28.0
-- Fecha: 2026-07-31
-- Autor: Claude (asistente IA), sesión de implementación con José — Dulce Sabor LLC
-- =============================================================================
-- Crea las 3 tablas del MVP de Mission Control: estado único, tareas del día
-- (máx. 3, validado en la capa de acceso a datos — src/lib/missionControl.ts —
-- no aquí) y aprendizajes breves.
--
-- ADMIN-ONLY: José es el único rol que ve/edita esto. Francisco (rep) no debe
-- poder leer ni escribir nada de estas 3 tablas — se usa is_admin(), la misma
-- función que ya protege deletes de clients/orders/representatives (ver
-- 2026-07-13_rls_fase3_candado.sql). No se crea ninguna función nueva.
--
-- Supuestos:
--   1. is_admin() ya existe en la base (verificado: SECURITY DEFINER, checa
--      app_users.role = 'admin' para auth.uid()). No se toca.
--   2. task_date / learning_date llegan YA calculados por la app en formato
--      YYYY-MM-DD (hora local de California vía Intl con timeZone fijo,
--      lib/missionControl.ts → getCaliforniaDateStr()). Por eso NO usan
--      "default current_date" (ese default es hora del servidor/UTC — la
--      misma clase de bug ya documentada en CLAUDE.md con pedidos después de
--      ~5pm PT). La app siempre manda el valor explícito.
--   3. position en mission_control_tasks: entero asignado por la app al crear
--      (0, 1, 2 en el orden de creación del día) — no hay drag-and-drop en el
--      MVP, solo preserva el orden de alta.
--   4. mission_control_state es una tabla de una sola fila (id fijo 'main'),
--      mismo patrón que notification_settings / sync_data. El INSERT inicial
--      va al final de este script (upsert, idempotente — seguro re-correrlo).
--
-- Idempotencia: todo el script es seguro de re-correr (create table/index "if
-- not exists", drop+create policy, insert "on conflict do nothing"). Envuelto
-- en una sola transacción (BEGIN/COMMIT) para evitar estados parciales si algo
-- falla a la mitad.
--
-- Cómo correrlo: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- =============================================================================

BEGIN;

-- ─── 1. mission_control_state — fila única id='main' ─────────────────────────
create table if not exists public.mission_control_state (
  id text primary key default 'main',
  mission_year1 text not null default '',
  sprint_name text not null default '',
  sprint_status text not null default 'No iniciado'
    check (sprint_status in ('En ejecución','Esperando','Bloqueado','No iniciado','Terminado')),
  project_name text not null default '',
  project_status text not null default 'No iniciado'
    check (project_status in ('En ejecución','Esperando','Bloqueado','No iniciado','Terminado')),
  weekly_business_goal text not null default '',
  weekly_structural_goal text not null default '',
  blockers jsonb not null default '[]',        -- array de strings
  roadmap_now jsonb not null default '[]',      -- array de strings
  roadmap_next jsonb not null default '[]',     -- array de strings
  roadmap_later jsonb not null default '[]',    -- array de strings
  projects_completed_count integer not null default 0,  -- métrica manual, se incrementa a mano
  updated_at timestamptz not null default now(),
  constraint mission_control_state_single_row check (id = 'main')
);

-- ─── 2. mission_control_tasks — hasta 3 filas por task_date ──────────────────
create table if not exists public.mission_control_tasks (
  id text primary key,
  task_date date not null,               -- YYYY-MM-DD, calculado por la app (hora CA)
  position integer not null default 0,   -- 0,1,2 — orden de alta, sin drag-and-drop
  text text not null,
  status text not null default 'pending' check (status in ('pending','done')),
  created_at timestamptz not null default now()
);

create index if not exists mission_control_tasks_date_idx
  on public.mission_control_tasks (task_date, position);

-- ─── 3. mission_control_learnings — log append-only ──────────────────────────
create table if not exists public.mission_control_learnings (
  id text primary key,
  learning_date date not null,           -- YYYY-MM-DD, calculado por la app (hora CA)
  text text not null,
  created_at timestamptz not null default now()
);

create index if not exists mission_control_learnings_date_idx
  on public.mission_control_learnings (learning_date desc, created_at desc);

-- ─── 4. RLS — admin-only en las 3 tablas ─────────────────────────────────────
alter table public.mission_control_state enable row level security;
alter table public.mission_control_tasks enable row level security;
alter table public.mission_control_learnings enable row level security;

-- Mismo patrón que 2026-07-13_rls_fase3_candado.sql: drop-if-exists antes de
-- cada create para que el script sea 100% re-ejecutable (CREATE POLICY no
-- soporta IF NOT EXISTS en Postgres).
drop policy if exists "admin_all_mission_control_state" on public.mission_control_state;
create policy "admin_all_mission_control_state" on public.mission_control_state
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_all_mission_control_tasks" on public.mission_control_tasks;
create policy "admin_all_mission_control_tasks" on public.mission_control_tasks
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_all_mission_control_learnings" on public.mission_control_learnings;
create policy "admin_all_mission_control_learnings" on public.mission_control_learnings
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Nota: no hay política para anon ni para authenticated-no-admin en ninguna
-- de las 3 tablas → select/insert/update/delete quedan bloqueados por default
-- de Postgres (RLS activo sin policy matching = deniega). Francisco (role
-- 'rep') puede autenticarse pero is_admin() da false para él → 0 filas, 0
-- writes, incluso si alguien intentara pegarle a la API REST directo.

-- ─── 5. Fila inicial de mission_control_state (idempotente) ─────────────────
insert into public.mission_control_state (id)
values ('main')
on conflict (id) do nothing;

-- ─── 6. Verificación ──────────────────────────────────────────────────────
select count(*) as tablas_creadas
from information_schema.tables
where table_schema = 'public'
  and table_name in ('mission_control_state','mission_control_tasks','mission_control_learnings');
-- esperado: 3

select count(*) as politicas_creadas
from pg_policies
where schemaname = 'public'
  and tablename in ('mission_control_state','mission_control_tasks','mission_control_learnings');
-- esperado: 3

select exists (
  select 1 from public.mission_control_state where id = 'main'
) as fila_main_existe;
-- esperado: true

COMMIT;
