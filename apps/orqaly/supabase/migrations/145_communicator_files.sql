-- ============================================================
-- 145_communicator_files.sql — Communicator Phase 2
--   Dedicated Storage bucket + metadata table for files forwarded
--   to the bot via Telegram (photos, PDFs, documents).
-- ============================================================

-- ── Storage bucket: communicator-uploads ───────────────────────────────────
-- Separate from general platform uploads so RLS / retention / audit are
-- isolated. Created idempotently (Supabase storage.buckets is an upsert-safe
-- registry).
insert into storage.buckets (id, name, public)
values ('communicator-uploads', 'communicator-uploads', false)
on conflict (id) do nothing;

-- Owner-only object access on this bucket. Storage RLS uses the
-- storage.objects table with bucket_id filter.
do $$
begin
  -- DROP first so re-running this migration is idempotent.
  drop policy if exists "communicator_uploads_select_own" on storage.objects;
  drop policy if exists "communicator_uploads_insert_own" on storage.objects;
  drop policy if exists "communicator_uploads_delete_own" on storage.objects;
exception when others then null;
end $$;

create policy "communicator_uploads_select_own" on storage.objects
  for select using (
    bucket_id = 'communicator-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "communicator_uploads_insert_own" on storage.objects
  for insert with check (
    bucket_id = 'communicator-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "communicator_uploads_delete_own" on storage.objects
  for delete using (
    bucket_id = 'communicator-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

-- ── communicator_files: metadata + extracted text ─────────────────────────
-- Convention: storage path = "<user_uuid>/<file_uuid>.<ext>" so storage RLS
-- can owner-scope by inspecting the first path segment.
create table if not exists public.communicator_files (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  channel_id        uuid references public.communication_channels(id) on delete cascade,
  filename          text not null default '',
  mime_type         text not null default '',
  size_bytes        bigint not null default 0,
  telegram_file_id  text,                       -- so we can re-fetch from Telegram CDN
  storage_path      text not null,              -- inside communicator-uploads bucket
  extracted_text    text,                       -- text content (PDF / OCR / caption)
  extraction_method text,                       -- 'pdf-parse' | 'vision-llm' | 'plain' | null
  metadata          jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null default (now() + interval '30 days')
);

create index if not exists idx_comm_files_user
  on public.communicator_files(user_id, created_at desc);
create index if not exists idx_comm_files_expires
  on public.communicator_files(expires_at);
create index if not exists idx_comm_files_channel
  on public.communicator_files(channel_id);

alter table public.communicator_files enable row level security;

drop policy if exists "comm_files_select_own" on public.communicator_files;
drop policy if exists "comm_files_insert_own" on public.communicator_files;
drop policy if exists "comm_files_delete_own" on public.communicator_files;

create policy "comm_files_select_own" on public.communicator_files
  for select using (user_id = auth.uid());

create policy "comm_files_insert_own" on public.communicator_files
  for insert with check (user_id = auth.uid());

create policy "comm_files_delete_own" on public.communicator_files
  for delete using (user_id = auth.uid());

-- ── Realtime + helpful comment ────────────────────────────────────────────
comment on table public.communicator_files is
  'Files forwarded to the bot via Telegram. Storage path lives in the communicator-uploads bucket. Auto-expires after 30 days via the cron added in this migration.';

-- ── Optional: helper function to purge expired files ──────────────────────
-- Removes both the metadata row and (best-effort) the storage object.
-- Scheduled via a Pulse tick or pg_cron call later; safe to invoke ad-hoc.
create or replace function public.purge_expired_communicator_files()
returns int
language plpgsql
security definer
as $$
declare
  victim record;
  removed int := 0;
begin
  for victim in
    select id, storage_path
    from public.communicator_files
    where expires_at < now()
    limit 500
  loop
    -- delete the storage object (ignore failures — purge_expired must be safe)
    begin
      perform storage.delete_object('communicator-uploads', victim.storage_path);
    exception when others then
      -- swallow; we still want the row gone so we don't keep retrying forever
      null;
    end;

    delete from public.communicator_files where id = victim.id;
    removed := removed + 1;
  end loop;

  return removed;
end;
$$;

revoke all on function public.purge_expired_communicator_files() from public;
grant execute on function public.purge_expired_communicator_files() to service_role;
