-- 175: storage metric snapshots - lightweight time-series for the Cloud Storage
-- Monitor's storage-over-time chart. One row per (user, connection, day); the
-- snapshot pulse (and each sync) upserts today's values. Mirrors the
-- report_kpi_snapshots pattern. Run in the Supabase SQL Editor. Idempotent.

create table if not exists public.storage_metric_snapshots (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  kb_connection_id  uuid references public.kb_connections(id) on delete cascade,
  source_type       text not null,

  bytes_used        bigint,
  bytes_total       bigint,
  docs_count        integer not null default 0,
  last_sync_ok      boolean,
  latency_ms        integer,

  snapshot_date     date not null default (now() at time zone 'utc')::date,
  created_at        timestamptz not null default now()
);

create index if not exists idx_storage_snapshots_user_date
  on public.storage_metric_snapshots(user_id, snapshot_date);
create index if not exists idx_storage_snapshots_conn
  on public.storage_metric_snapshots(kb_connection_id, snapshot_date);

-- One snapshot per connection per day (idempotent daily upsert).
create unique index if not exists uq_storage_snapshots_day
  on public.storage_metric_snapshots(user_id, kb_connection_id, snapshot_date);

alter table public.storage_metric_snapshots enable row level security;

drop policy if exists storage_snapshots_owner on public.storage_metric_snapshots;
create policy storage_snapshots_owner on public.storage_metric_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists storage_snapshots_service on public.storage_metric_snapshots;
create policy storage_snapshots_service on public.storage_metric_snapshots
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
