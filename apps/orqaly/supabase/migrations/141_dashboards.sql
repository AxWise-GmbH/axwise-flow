-- 141_dashboards.sql
-- Custom Dashboard Builder — Phase 1 schema.
-- Tables:
--   saved_dashboards         user-owned dashboard configs (jsonb)
--   share_groups             human-collaboration groups (distinct from agent_teams)
--   share_group_members      group membership
--   dashboard_shares         which dashboards are shared into which groups
--   dashboard_schedules      scheduled HTML/PDF email exports (cron-driven via pulse_runs)
-- All tables RLS-enabled per CLAUDE.md rule 5.

-- ─── saved_dashboards ─────────────────────────────────────────────────────────
create table if not exists public.saved_dashboards (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  title text not null,
  description text,
  config jsonb not null default '{"version":1,"layout":[],"blocks":[],"global_filters":{}}'::jsonb,
  visibility text not null default 'private' check (visibility in ('private','group','public')),
  is_template boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_saved_dashboards_owner on public.saved_dashboards(owner_user_id, updated_at desc);
create index if not exists idx_saved_dashboards_templates on public.saved_dashboards(is_template) where is_template = true;

alter table public.saved_dashboards enable row level security;

-- ─── share_groups ─────────────────────────────────────────────────────────────
create table if not exists public.share_groups (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists idx_share_groups_owner on public.share_groups(owner_user_id);

alter table public.share_groups enable row level security;

-- ─── share_group_members ──────────────────────────────────────────────────────
create table if not exists public.share_group_members (
  group_id uuid not null references public.share_groups(id) on delete cascade,
  user_id uuid not null,
  role text not null default 'viewer' check (role in ('viewer','editor')),
  added_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists idx_share_group_members_user on public.share_group_members(user_id);

alter table public.share_group_members enable row level security;

-- ─── dashboard_shares ─────────────────────────────────────────────────────────
create table if not exists public.dashboard_shares (
  dashboard_id uuid not null references public.saved_dashboards(id) on delete cascade,
  group_id uuid not null references public.share_groups(id) on delete cascade,
  can_edit boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (dashboard_id, group_id)
);

alter table public.dashboard_shares enable row level security;

-- ─── dashboard_schedules ──────────────────────────────────────────────────────
create table if not exists public.dashboard_schedules (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.saved_dashboards(id) on delete cascade,
  owner_user_id uuid not null,
  cron_expr text not null,
  recipients text[] not null default array[]::text[],
  format text not null default 'html' check (format in ('html','pdf')),
  enabled boolean not null default true,
  last_run_at timestamptz,
  next_due_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_dashboard_schedules_due on public.dashboard_schedules(next_due_at) where enabled = true;
create index if not exists idx_dashboard_schedules_owner on public.dashboard_schedules(owner_user_id);

alter table public.dashboard_schedules enable row level security;

-- ─── RLS policies ─────────────────────────────────────────────────────────────

-- Helper: a dashboard is readable by user when (a) they own it, (b) visibility='public',
-- or (c) it's shared into a group they belong to.
drop policy if exists "saved_dashboards_owner_all" on public.saved_dashboards;
create policy "saved_dashboards_owner_all" on public.saved_dashboards
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

drop policy if exists "saved_dashboards_read_shared" on public.saved_dashboards;
create policy "saved_dashboards_read_shared" on public.saved_dashboards
  for select using (
    visibility = 'public'
    or exists (
      select 1
      from public.dashboard_shares ds
      join public.share_group_members sgm on sgm.group_id = ds.group_id
      where ds.dashboard_id = saved_dashboards.id
        and sgm.user_id = auth.uid()
    )
  );

drop policy if exists "saved_dashboards_update_editor" on public.saved_dashboards;
create policy "saved_dashboards_update_editor" on public.saved_dashboards
  for update using (
    exists (
      select 1
      from public.dashboard_shares ds
      join public.share_group_members sgm on sgm.group_id = ds.group_id
      where ds.dashboard_id = saved_dashboards.id
        and sgm.user_id = auth.uid()
        and ds.can_edit = true
    )
  );

-- share_groups: owner full access; members can read their groups.
drop policy if exists "share_groups_owner_all" on public.share_groups;
create policy "share_groups_owner_all" on public.share_groups
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

drop policy if exists "share_groups_member_read" on public.share_groups;
create policy "share_groups_member_read" on public.share_groups
  for select using (
    exists (
      select 1 from public.share_group_members sgm
      where sgm.group_id = share_groups.id and sgm.user_id = auth.uid()
    )
  );

-- share_group_members: group owner manages; user can read own memberships.
drop policy if exists "share_group_members_owner_all" on public.share_group_members;
create policy "share_group_members_owner_all" on public.share_group_members
  for all using (
    exists (
      select 1 from public.share_groups sg
      where sg.id = share_group_members.group_id and sg.owner_user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.share_groups sg
      where sg.id = share_group_members.group_id and sg.owner_user_id = auth.uid()
    )
  );

drop policy if exists "share_group_members_self_read" on public.share_group_members;
create policy "share_group_members_self_read" on public.share_group_members
  for select using (user_id = auth.uid());

-- dashboard_shares: dashboard owner manages; group members can read.
drop policy if exists "dashboard_shares_owner_all" on public.dashboard_shares;
create policy "dashboard_shares_owner_all" on public.dashboard_shares
  for all using (
    exists (
      select 1 from public.saved_dashboards sd
      where sd.id = dashboard_shares.dashboard_id and sd.owner_user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.saved_dashboards sd
      where sd.id = dashboard_shares.dashboard_id and sd.owner_user_id = auth.uid()
    )
  );

drop policy if exists "dashboard_shares_member_read" on public.dashboard_shares;
create policy "dashboard_shares_member_read" on public.dashboard_shares
  for select using (
    exists (
      select 1 from public.share_group_members sgm
      where sgm.group_id = dashboard_shares.group_id and sgm.user_id = auth.uid()
    )
  );

-- dashboard_schedules: owner only.
drop policy if exists "dashboard_schedules_owner_all" on public.dashboard_schedules;
create policy "dashboard_schedules_owner_all" on public.dashboard_schedules
  for all using (auth.uid() = owner_user_id) with check (auth.uid() = owner_user_id);

-- ─── updated_at triggers ──────────────────────────────────────────────────────
create or replace function public.tg_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_saved_dashboards_updated_at on public.saved_dashboards;
create trigger trg_saved_dashboards_updated_at
  before update on public.saved_dashboards
  for each row execute function public.tg_set_updated_at();

drop trigger if exists trg_dashboard_schedules_updated_at on public.dashboard_schedules;
create trigger trg_dashboard_schedules_updated_at
  before update on public.dashboard_schedules
  for each row execute function public.tg_set_updated_at();
