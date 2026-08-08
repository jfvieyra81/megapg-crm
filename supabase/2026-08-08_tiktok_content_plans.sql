-- =============================================================================
-- TikTok Content Lab v1.0 — recomendaciones planeadas/publicadas
-- CRM v5.34.0
-- Fecha: 2026-08-08
-- =============================================================================
-- Guarda las ideas que José decide trabajar desde TikTok Intelligence.
-- Esta tabla NO modifica tiktok_videos ni tiktok_video_classifications y la
-- Edge Function tiktok-sync no la lee ni escribe; por eso una sincronización
-- nunca puede borrar ni cambiar el plan de contenido.
--
-- Los productos se guardan como ids del catálogo del frontend, igual que en
-- tiktok_video_classifications. La relación a una cuenta es opcional para
-- conservar planes aunque una cuenta TikTok se desconecte.
--
-- Anti-duplicados: `idea_key` es una huella determinística del contenido de
-- la idea (productos ordenados + tema + formato + gancho, no el título), con
-- restricción UNIQUE. El frontend inserta con
-- `on_conflict=idea_key` + `Prefer: resolution=ignore-duplicates`, así que un
-- doble clic o dos pestañas abiertas no crean un plan repetido — la base de
-- datos es la que lo garantiza, no solo la comparación de títulos en pantalla.
-- =============================================================================

BEGIN;

create table if not exists public.tiktok_content_plans (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.tiktok_accounts(id) on delete set null,
  idea_key text not null,
  title text not null,
  product_ids text[] not null default '{}'::text[],
  theme text,
  format text,
  hook text,
  cta text,
  rationale text,
  status text not null default 'planned' check (status in ('planned', 'published')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_key)
);

create index if not exists tiktok_content_plans_status_created_idx
  on public.tiktok_content_plans (status, created_at desc);

alter table public.tiktok_content_plans enable row level security;

drop policy if exists "admin_all_tiktok_content_plans" on public.tiktok_content_plans;
create policy "admin_all_tiktok_content_plans" on public.tiktok_content_plans
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

COMMIT;
