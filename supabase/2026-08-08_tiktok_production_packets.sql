-- =============================================================================
-- TikTok Production Packets v1.0 — Agente Productor (paquete de producción)
-- CRM v5.35.0
-- Fecha: 2026-08-08
-- =============================================================================
-- REQUIERE haber corrido antes supabase/2026-08-08_tiktok_content_plans.sql:
-- esta tabla referencia tiktok_content_plans.id por FK, así que fallará si esa
-- tabla todavía no existe.
--
-- Guarda el paquete de producción (guion, tomas, iluminación, audio,
-- checklist, etc.) generado para cada plan del "Laboratorio de Contenido", en
-- relación 1:1 (un plan → un paquete, FK plan_id con restricción UNIQUE).
--
-- No hay proveedor de IA configurado en el proyecto todavía (sin credenciales
-- de OpenAI/Anthropic/etc. en ninguna Edge Function): por ahora el CRM genera
-- una plantilla profesional editable a partir de los datos del plan
-- (src/lib/productionPacket.ts, buildTemplatePacket), sin llamar a ningún
-- servicio externo. Si en el futuro se conecta un proveedor de IA, la
-- generación se haría en una Edge Function con la clave solo en el servidor
-- (nunca en el navegador) — esta tabla es el mismo contrato de datos para
-- ambos casos, por eso ya incluye la columna `source` ('template' | 'ai').
--
-- Esta tabla NO modifica tiktok_videos, tiktok_video_classifications ni
-- tiktok_content_plans, y ninguna Edge Function existente (tiktok-connect,
-- tiktok-oauth-callback, tiktok-sync) la lee ni la escribe: sincronizar
-- TikTok nunca puede borrar ni cambiar un paquete de producción. Tampoco
-- publica nada a TikTok — el estado "publicado" es solo una marca
-- administrativa que pone José a mano después de subir el video.
--
-- Anti-duplicados: `plan_id` es UNIQUE. El frontend inserta con
-- `on_conflict=plan_id` + `Prefer: resolution=ignore-duplicates`, así que
-- crear el paquete dos veces (doble clic, dos pestañas) no duplica la fila —
-- la base de datos lo garantiza, mismo patrón que idea_key en
-- tiktok_content_plans.
--
-- `content` (jsonb) guarda la estructura completa y editable del paquete:
-- objetivo, audiencia, hipótesis, producto principal/secundarios, duración,
-- guion segundo a segundo, tomas, iluminación, audio, props/vestuario/
-- ubicación, instrucciones de edición, caption/CTA/hashtags, checklists y
-- nota de seguridad. Ver src/lib/productionPacket.ts (ProductionPacketContent)
-- para el contrato exacto de campos — jsonb permite editar y guardar toda esa
-- estructura sin perder información y sin una migración por cada campo.
--
-- ADMIN-ONLY: mismo criterio que el resto de TikTok Intelligence — is_admin()
-- ya existe en la base, no se toca ni se crea función nueva.
-- =============================================================================

BEGIN;

create table if not exists public.tiktok_production_packets (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.tiktok_content_plans(id) on delete cascade,
  status text not null default 'borrador' check (status in ('borrador', 'aprobado', 'grabado', 'publicado')),
  source text not null default 'template' check (source in ('template', 'ai')),
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id)
);

create index if not exists tiktok_production_packets_status_idx
  on public.tiktok_production_packets (status);

alter table public.tiktok_production_packets enable row level security;

drop policy if exists "admin_all_tiktok_production_packets" on public.tiktok_production_packets;
create policy "admin_all_tiktok_production_packets" on public.tiktok_production_packets
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

COMMIT;
