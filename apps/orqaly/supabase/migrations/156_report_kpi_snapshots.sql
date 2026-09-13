-- 133_report_kpi_snapshots.sql
-- Daily KPI snapshots that power real trend lines on the Reports page.
--
-- Until this table existed the trend chart was generated client-side with
-- Math.random() multipliers over today's value — meaningless "history" that
-- looked impressive but eroded user trust. snapshot-report-kpis writes one
-- row per user per kpi_set per day; the reports handler reads the last N
-- months to draw real trend lines (and shows an empty-state hint while the
-- history is still building up).

create table if not exists public.report_kpi_snapshots (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  snapshot_date   date not null default (now() at time zone 'utc')::date,
  kpi_set         text not null check (kpi_set in ('finance', 'partner_perf', 'operations', 'executive')),
  values          jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (user_id, snapshot_date, kpi_set)
);

create index if not exists idx_report_kpi_snapshots_user_date
  on public.report_kpi_snapshots (user_id, snapshot_date desc);

create index if not exists idx_report_kpi_snapshots_user_set_date
  on public.report_kpi_snapshots (user_id, kpi_set, snapshot_date desc);

alter table public.report_kpi_snapshots enable row level security;

drop policy if exists "kpi_snapshots_select_own" on public.report_kpi_snapshots;
create policy "kpi_snapshots_select_own"
  on public.report_kpi_snapshots
  for select
  using (auth.uid() = user_id);

-- No insert/update/delete policies — only the nightly cron (service role) writes.
