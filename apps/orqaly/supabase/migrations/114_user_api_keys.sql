-- 114_user_api_keys.sql
-- User-provided API keys with envelope encryption.
-- Ciphertext lives in vault.secrets; this table stores metadata + pointer.

create table if not exists public.user_api_keys (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  -- Prefixed provider id, e.g. 'llm:openai', 'tool:github', 'composio:master'
  provider         text not null,
  slot             text not null default 'default',

  -- Safe metadata (never contains key material)
  label            text,
  masked_preview   text not null,
  fingerprint      text not null,
  key_length       int  not null,

  -- Pointer to encrypted envelope in vault.secrets
  vault_secret_id  uuid not null,

  -- Versioning for rotation
  is_current       boolean not null default true,
  superseded_at    timestamptz,
  superseded_by    uuid references public.user_api_keys(id) on delete set null,

  -- Envelope metadata
  kek_id           text not null default 'ORQ_KEK_V1',
  algorithm        text not null default 'AES-256-GCM',
  envelope_version int  not null default 1,

  -- Test state
  last_tested_at   timestamptz,
  last_test_ok     boolean,
  last_test_error  text,

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_user_api_keys_user             on public.user_api_keys(user_id);
create index if not exists idx_user_api_keys_user_prov_curr   on public.user_api_keys(user_id, provider) where is_current;
create index if not exists idx_user_api_keys_fingerprint      on public.user_api_keys(fingerprint);

-- Only one current key per (user, provider, slot)
create unique index if not exists uq_user_api_keys_current
  on public.user_api_keys(user_id, provider, slot)
  where is_current;

alter table public.user_api_keys enable row level security;

drop policy if exists "Users read own api keys"   on public.user_api_keys;
drop policy if exists "Users insert own api keys" on public.user_api_keys;
drop policy if exists "Users update own api keys" on public.user_api_keys;
drop policy if exists "Users delete own api keys" on public.user_api_keys;

create policy "Users read own api keys"   on public.user_api_keys for select using  (auth.uid() = user_id);
create policy "Users insert own api keys" on public.user_api_keys for insert with check (auth.uid() = user_id);
create policy "Users update own api keys" on public.user_api_keys for update using  (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own api keys" on public.user_api_keys for delete using  (auth.uid() = user_id);

create or replace function public.touch_user_api_keys_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end; $$;

drop trigger if exists trg_user_api_keys_touch on public.user_api_keys;
create trigger trg_user_api_keys_touch
  before update on public.user_api_keys
  for each row execute function public.touch_user_api_keys_updated_at();

create or replace function public.audit_user_api_keys()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (action, entity, entity_id, user_id, details)
  values (
    tg_op,
    'user_api_keys',
    coalesce(new.id::text, old.id::text),
    coalesce(new.user_id, old.user_id),
    jsonb_build_object(
      'provider',   coalesce(new.provider, old.provider),
      'slot',       coalesce(new.slot, old.slot),
      'masked',     coalesce(new.masked_preview, old.masked_preview),
      'is_current', coalesce(new.is_current, old.is_current)
    )::text
  );
  return coalesce(new, old);
end; $$;

drop trigger if exists trg_user_api_keys_audit on public.user_api_keys;
create trigger trg_user_api_keys_audit
  after insert or update or delete on public.user_api_keys
  for each row execute function public.audit_user_api_keys();
