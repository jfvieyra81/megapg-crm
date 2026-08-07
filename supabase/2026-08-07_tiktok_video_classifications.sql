-- =============================================================================
-- TikTok Video Classifications v1.0
-- CRM v5.31.0
-- Fecha: 2026-08-07
-- Autor: Claude (asistente IA), sesión de implementación — Dulce Sabor LLC
-- =============================================================================
-- Base para clasificar los videos de TikTok ya importados (producto, tema,
-- formato, gancho inicial, llamada a la acción, etiquetas). Tabla NUEVA y
-- separada de `tiktok_videos` — a propósito, para no tocar la sincronización
-- existente (supabase/functions/tiktok-sync/index.ts hace upsert por
-- (account_id, video_id) y solo escribe las columnas que ya conoce; una tabla
-- aparte garantiza cero colisión con ese proceso y cero riesgo de borrar datos
-- sincronizados). Relación 1:1 con tiktok_videos vía FK = PK.
--
-- ADMIN-ONLY: mismo criterio que el resto de TikTok Intelligence (ver
-- 2026-08-06_tiktok_intelligence.sql) — is_admin() ya existe en la base, no se
-- toca ni se crea función nueva.
--
-- product_id es texto libre (no FK): el catálogo de productos (PRODUCTS) vive
-- como constante en el código (src/lib/catalog.ts), no como tabla en Supabase
-- — se guarda el id del catálogo (ej. "slaps-mix") tal cual lo manda la app.
--
-- Idempotencia: create table "if not exists", drop+create policy, script
-- envuelto en BEGIN/COMMIT (mismo patrón que 2026-07-31_mission_control.sql).
--
-- Cómo correrlo: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- =============================================================================

BEGIN;

create table if not exists public.tiktok_video_classifications (
  video_id uuid primary key references public.tiktok_videos(id) on delete cascade,
  product_id text,           -- id del catálogo PRODUCTS (src/lib/catalog.ts), o null
  theme text,                 -- tema del video
  format text,                -- formato (texto libre: unboxing, receta, reto, etc.)
  hook text,                  -- gancho inicial (primeras palabras/frase)
  cta text,                   -- llamada a la acción
  tags text[] not null default '{}'::text[],  -- etiquetas libres
  updated_at timestamptz not null default now()
);

create index if not exists tiktok_video_classifications_product_idx
  on public.tiktok_video_classifications (product_id);

alter table public.tiktok_video_classifications enable row level security;

drop policy if exists "admin_all_tiktok_video_classifications" on public.tiktok_video_classifications;
create policy "admin_all_tiktok_video_classifications" on public.tiktok_video_classifications
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Nota: sin política para anon ni para authenticated-no-admin → select/
-- insert/update/delete quedan bloqueados por default de Postgres (RLS activo
-- sin policy matching = deniega). No hay política de escritura pública, igual
-- que tiktok_accounts y tiktok_videos.

COMMIT;
