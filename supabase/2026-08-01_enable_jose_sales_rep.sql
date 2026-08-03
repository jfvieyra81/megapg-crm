-- =============================================================================
-- SPRINT 2.5 — ENABLE JOSÉ AS SALES REP (2026-08-01)
-- Crea una segunda identidad operativa para José, separada de su cuenta admin:
--   - megapg.norcal@gmail.com → sigue como role='admin' (sin cambios)
--   - jfvieyra@gmail.com      → nueva cuenta role='rep', ligada a
--                               representatives.id = 'rep-jose-flores'
--
-- Precondición ya verificada: jfvieyra@gmail.com ya pidió y completó su magic
-- link, así que ya existe su fila real en auth.users (se vio "Acceso no
-- autorizado" porque todavía no había fila en app_users — este script la crea).
--
-- Busca el auth_user_id por email (no se copia ningún UUID a mano). Idempotente:
-- reejecutarlo dos veces deja el mismo resultado, y además repara la fila de
-- representatives si quedó parcial o desactualizada. No toca la cuenta admin
-- (otro auth_user_id) ni a Francisco (otro id de representante). No modifica
-- RLS ni funciones.
--
-- Cómo correrlo: Supabase Dashboard → SQL Editor → pegar todo → Run.
-- =============================================================================

begin;

do $$
declare
  v_auth_user_id uuid;
begin
  -- Busca el auth_user_id por email — nunca se copia un UUID a mano.
  select id into v_auth_user_id
  from auth.users
  where lower(email) = 'jfvieyra@gmail.com'
  limit 1;

  if v_auth_user_id is null then
    raise exception 'No existe auth.users para jfvieyra@gmail.com — aborta sin tocar nada.';
  end if;

  -- 1) Crea o repara el representante. Idempotente: upsert por id que además
  --    corrige auth_user_id/data/updated_at si la fila ya existía parcial o
  --    desactualizada (p.ej. de una corrida anterior interrumpida).
  insert into public.representatives (id, auth_user_id, data, updated_at)
  values (
    'rep-jose-flores',
    v_auth_user_id,
    jsonb_build_object(
      'id', 'rep-jose-flores',
      'name', 'José Flores',
      'phone', '',
      'email', 'jfvieyra@gmail.com',
      'contractDate', '',
      'phase2Active', false,
      'phase2StartDate', '',
      'milestonesPaid', '[]'::jsonb,
      'terminatedDate', '',
      'notes', '',
      'created', now()::text
    ),
    now()
  )
  on conflict (id) do update
    set auth_user_id = excluded.auth_user_id,
        data = excluded.data,
        updated_at = excluded.updated_at;

  -- 2) Crea o actualiza su fila en app_users como 'rep'. Idempotente: upsert
  --    por auth_user_id (la primary key de la tabla).
  insert into public.app_users (auth_user_id, role, representative_id, email)
  values (v_auth_user_id, 'rep', 'rep-jose-flores', 'jfvieyra@gmail.com')
  on conflict (auth_user_id) do update
    set role = excluded.role,
        representative_id = excluded.representative_id,
        email = excluded.email;
end $$;

commit;

-- Verificación (solo lectura, para confirmar visualmente el resultado):
select auth_user_id, role, representative_id, email from public.app_users order by email;
select id, auth_user_id, data->>'name' as name, data->>'email' as email from public.representatives order by id;
