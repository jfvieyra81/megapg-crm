-- TikTok Intelligence v1.2 — productos múltiples por video.
-- Conserva product_id como producto principal y agrega product_ids para
-- registrar todos los productos mostrados. No modifica videos ni sincronización.

BEGIN;

alter table public.tiktok_video_classifications
  add column if not exists product_ids text[] not null default '{}'::text[];

-- Los videos ya clasificados conservan su producto principal dentro de la
-- nueva lista para que los análisis nuevos no pierdan historial.
update public.tiktok_video_classifications
  set product_ids = array[product_id]
  where product_id is not null and product_ids = '{}'::text[];

COMMIT;
