-- 115_key_imports.sql
-- Bulk import jobs for /settings/keys page.
-- Tracks each uploaded file / paste session: VT scan result, parse counts,
-- apply counts, storage path, retention.

create table if not exists public.key_imports (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,

  storage_path     text,                      -- supabase storage path (null for paste)
  source_type      text not null check (source_type in ('file', 'paste')),
  source_filename  text,
  source_format    text not null check (source_format in ('env', 'json', 'csv', 'paste', 'yaml')),

  sha256           text,
  file_size        int,

  vt_scan_id       text,
  vt_status        text check (vt_status in ('clean', 'malicious', 'unknown', 'skipped')),
  vt_stats         jsonb,

  parsed_keys      int not null default 0,
  matched_keys     int not null default 0,
  applied_keys     int not null default 0,
  failed_keys      int not null default 0,

  status           text not null default 'scanning'
                     check (status in ('scanning', 'ready', 'blocked', 'applied', 'cancelled', 'error')),
  error            text,

  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null default (now() + interval '30 days'),
  deleted_at       timestamptz
);

create index if not exists idx_key_imports_user       on public.key_imports(user_id);
create index if not exists idx_key_imports_status     on public.key_imports(status);
create index if not exists idx_key_imports_expires    on public.key_imports(expires_at) where deleted_at is null;

alter table public.key_imports enable row level security;

drop policy if exists "Users read own imports"   on public.key_imports;
drop policy if exists "Users insert own imports" on public.key_imports;
drop policy if exists "Users update own imports" on public.key_imports;
drop policy if exists "Users delete own imports" on public.key_imports;

create policy "Users read own imports"   on public.key_imports for select using  (auth.uid() = user_id);
create policy "Users insert own imports" on public.key_imports for insert with check (auth.uid() = user_id);
create policy "Users update own imports" on public.key_imports for update using  (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own imports" on public.key_imports for delete using  (auth.uid() = user_id);

create or replace function public.audit_key_imports()
returns trigger language plpgsql security definer as $$
begin
  insert into public.audit_log (action, entity, entity_id, user_id, details)
  values (
    case tg_op
      when 'INSERT' then 'IMPORT_STARTED'
      when 'UPDATE' then 'IMPORT_' || coalesce(new.status, 'UPDATED')
      when 'DELETE' then 'IMPORT_DELETED'
    end,
    'key_imports',
    coalesce(new.id::text, old.id::text),
    coalesce(new.user_id, old.user_id),
    jsonb_build_object(
      'status',        coalesce(new.status, old.status),
      'source_type',   coalesce(new.source_type, old.source_type),
      'source_format', coalesce(new.source_format, old.source_format),
      'parsed_keys',   coalesce(new.parsed_keys, old.parsed_keys),
      'applied_keys',  coalesce(new.applied_keys, old.applied_keys),
      'vt_status',     coalesce(new.vt_status, old.vt_status)
    )::text
  );
  return coalesce(new, old);
end; $$;

drop trigger if exists trg_key_imports_audit on public.key_imports;
create trigger trg_key_imports_audit
  after insert or update or delete on public.key_imports
  for each row execute function public.audit_key_imports();
