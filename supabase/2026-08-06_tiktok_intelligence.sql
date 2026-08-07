-- TikTok Intelligence v1 (solo lectura). Ejecutar una vez en Supabase SQL Editor.
-- No guarda tokens en texto plano: los Edge Functions guardan únicamente valores cifrados.
create table if not exists public.tiktok_accounts (
  id uuid primary key default gen_random_uuid(),
  open_id text not null unique,
  display_name text,
  username text,
  avatar_url text,
  access_token_ciphertext text not null,
  refresh_token_ciphertext text not null,
  access_token_expires_at timestamptz,
  refresh_token_expires_at timestamptz,
  connected_by uuid references auth.users(id),
  connected_at timestamptz not null default now(),
  last_synced_at timestamptz
);
create table if not exists public.tiktok_videos (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.tiktok_accounts(id) on delete cascade,
  video_id text not null,
  title text,
  description text,
  cover_image_url text,
  share_url text,
  create_time timestamptz not null,
  duration_seconds integer,
  view_count bigint not null default 0,
  like_count bigint not null default 0,
  comment_count bigint not null default 0,
  share_count bigint not null default 0,
  source_payload jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz not null default now(),
  unique (account_id, video_id)
);
create table if not exists public.tiktok_oauth_states (
  state_hash text primary key,
  requested_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  used_at timestamptz
);
alter table public.tiktok_accounts enable row level security;
alter table public.tiktok_videos enable row level security;
alter table public.tiktok_oauth_states enable row level security;
create policy "admins read tiktok accounts" on public.tiktok_accounts for select to authenticated using (public.is_admin());
create policy "admins read tiktok videos" on public.tiktok_videos for select to authenticated using (public.is_admin());
-- OAuth state and all token writes are Edge Function-only through service_role; no browser write policy exists.
