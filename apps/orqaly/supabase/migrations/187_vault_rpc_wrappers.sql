-- 187_vault_rpc_wrappers.sql
-- Make Supabase Vault reachable from the app, so BYOK actually works.
--
-- THE BUG THIS FIXES: lib/security/vault-storage.js calls
--   admin.rpc('create_secret')  -> PostgREST resolves this as public.create_secret
--   admin.schema('vault')       -> PostgREST answers "Invalid schema: vault"
-- Neither exists/works, so every attempt to store a BYOK key has failed with
-- VAULT_PUT_FAILED since the feature was written. `user_api_keys` has 0 rows —
-- not because nobody tried, but because saving a key was never possible.
--
-- The vault schema is deliberately NOT exposed to PostgREST: vault.decrypted_secrets
-- would then be reachable by anon/authenticated, which is exactly the disaster the
-- vault exists to prevent. So instead: narrow SECURITY DEFINER wrappers in public,
-- executable by service_role ONLY. Every caller is a server-side handler that has
-- already verified user ownership (resolve-user-key.js re-checks row.user_id even
-- against the service role).
--
-- Idempotent. Apply in the Supabase Dashboard SQL Editor.

create extension if not exists supabase_vault with schema vault;

-- ── create ──────────────────────────────────────────────────────────────────
create or replace function public.vault_create_secret(
  new_secret text,
  new_name text,
  new_description text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret_id uuid;
begin
  -- Belt and braces: the grants below already restrict this, but a SECURITY
  -- DEFINER function that touches the vault should never rely on grants alone.
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'vault_create_secret: service_role only';
  end if;
  select vault.create_secret(new_secret, new_name, new_description) into secret_id;
  return secret_id;
end;
$$;

-- ── read ────────────────────────────────────────────────────────────────────
create or replace function public.vault_read_secret(secret_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  plaintext text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'vault_read_secret: service_role only';
  end if;
  select decrypted_secret into plaintext
    from vault.decrypted_secrets
    where id = secret_id
    limit 1;
  return plaintext;
end;
$$;

-- ── update (key rotation) ───────────────────────────────────────────────────
create or replace function public.vault_update_secret(secret_id uuid, new_secret text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'vault_update_secret: service_role only';
  end if;
  perform vault.update_secret(secret_id, new_secret);
end;
$$;

-- ── delete (hard delete only) ───────────────────────────────────────────────
create or replace function public.vault_delete_secret(secret_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'vault_delete_secret: service_role only';
  end if;
  delete from vault.secrets where id = secret_id;
end;
$$;

-- ── grants: service_role only, never anon/authenticated ─────────────────────
revoke all on function public.vault_create_secret(text, text, text) from public, anon, authenticated;
revoke all on function public.vault_read_secret(uuid) from public, anon, authenticated;
revoke all on function public.vault_update_secret(uuid, text) from public, anon, authenticated;
revoke all on function public.vault_delete_secret(uuid) from public, anon, authenticated;

grant execute on function public.vault_create_secret(text, text, text) to service_role;
grant execute on function public.vault_read_secret(uuid) to service_role;
grant execute on function public.vault_update_secret(uuid, text) to service_role;
grant execute on function public.vault_delete_secret(uuid) to service_role;
