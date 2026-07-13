-- =============================================================================
-- Bloque RLS — Fase 2: DIAGNÓSTICO (solo lectura, no cambia nada)
-- Muestra el estado actual antes del lockdown: políticas existentes, si RLS
-- está activo, los usuarios del CRM, y la definición de is_admin().
-- Cómo correrlo: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- Pegar los resultados de vuelta en el chat (o captura de pantalla).
-- =============================================================================

-- 1. Políticas actuales sobre las tablas a cerrar
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('clients','orders','representatives','commissions',
                    'inventory','purchases','public_stores','daily_digests')
order by tablename, policyname;

-- 2. ¿Cuáles de esas tablas tienen RLS activado?
select c.relname as tabla, c.relrowsecurity as rls_activo
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('clients','orders','representatives','commissions',
                    'inventory','purchases','public_stores','daily_digests')
order by c.relname;

-- 3. Usuarios del CRM (verificar que Francisco esté y tenga cuenta vinculada)
select email, role, representative_id, (auth_user_id is not null) as vinculado
from public.app_users;

-- 4. Definición actual de is_admin() (para que is_app_user() siga el mismo estilo)
select pg_get_functiondef('public.is_admin()'::regprocedure);

-- 5. Políticas actuales del bucket de fotos (storage)
select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
order by policyname;
