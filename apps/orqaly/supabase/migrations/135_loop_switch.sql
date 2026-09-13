-- 135_loop_switch.sql
-- Loop switch on goals: auto-spawn a continuation goal on completion, refine
-- the parent's deliverables with the child's strategy, track chain ancestry
-- and spend telemetry. Also adds the notification fan-out tables used to
-- alert the user on chain pause / auto-pivot events (Phase 1.9).
--
-- All ALTERs use IF NOT EXISTS so re-running on a partially-migrated DB is
-- safe. parent_goal_id already exists from migration 076 — declared again
-- here for self-contained reading; the IF NOT EXISTS makes it a no-op.

-- ── Loop fields on goals ──────────────────────────────────────────────
alter table public.goals
  add column if not exists loop_enabled boolean not null default false;

alter table public.goals
  add column if not exists parent_goal_id uuid references public.goals(id) on delete set null;

alter table public.goals
  add column if not exists continuation_goal_id uuid references public.goals(id) on delete set null;

alter table public.goals
  add column if not exists loop_depth integer not null default 0;

alter table public.goals
  add column if not exists loop_chain_root_id uuid references public.goals(id) on delete set null;

alter table public.goals
  add column if not exists loop_paused boolean not null default false;

alter table public.goals
  add column if not exists loop_paused_reason text;

create index if not exists idx_goals_parent_goal_id on public.goals(parent_goal_id);
create index if not exists idx_goals_continuation_goal_id on public.goals(continuation_goal_id);
create index if not exists idx_goals_loop_chain_root_id on public.goals(loop_chain_root_id);
create index if not exists idx_goals_loop_enabled_status on public.goals(loop_enabled, status)
  where loop_enabled = true;

-- ── source_goal_id on deliverable_refinements ─────────────────────────
-- Marks refinements that came from a loop continuation (vs user-initiated).
-- Lets the UI label them "🔁 Refined by continuation goal".
alter table public.deliverable_refinements
  add column if not exists source_goal_id uuid references public.goals(id) on delete set null;

create index if not exists idx_deliverable_refinements_source_goal_id
  on public.deliverable_refinements(source_goal_id)
  where source_goal_id is not null;

-- ── Per-chain spend telemetry ─────────────────────────────────────────
-- Rolls up spent_usd by chain. Self-rooted goals (no loop) appear as their
-- own one-row chain. UI surfaces this as a small "$X · N goals" chip.
create or replace view public.chain_spend_v as
  select
    coalesce(loop_chain_root_id, id) as chain_root_id,
    sum(coalesce(spent_usd, 0))::numeric as spent_usd,
    count(*)::integer as goal_count,
    coalesce(max(loop_depth), 0)::integer as max_depth,
    bool_or(loop_enabled) as has_active_loop,
    bool_or(loop_paused) as has_paused_link
  from public.goals
  group by coalesce(loop_chain_root_id, id);

comment on view public.chain_spend_v is
  'Per-loop-chain spend rollup. chain_root_id = the original root goal of the chain. spent_usd is sum across all goals in the chain.';

-- ── Notifications tables (Phase 1.9 — silent-failure prevention) ──────
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,            -- 'loop_continuation_spawned' | 'loop_chain_paused' | 'loop_auto_pivot_fired' | 'loop_kpi_alert' | ...
  payload jsonb not null default '{}'::jsonb,
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- notifications was introduced in migration 008 with a broader legacy event
-- shape. CREATE TABLE IF NOT EXISTS does not merge columns into that table, so
-- converge it additively before the loop indexes and policies reference the
-- newer fields. The default safely labels any legacy rows on an existing DB.
alter table public.notifications
  add column if not exists event_type text not null default 'legacy_notification',
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists read_at timestamptz,
  add column if not exists created_at timestamptz not null default now();

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, created_at desc)
  where read_at is null;
create index if not exists idx_notifications_user_all
  on public.notifications(user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_owner_select" on public.notifications;
create policy "notifications_owner_select" on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists "notifications_owner_update" on public.notifications;
create policy "notifications_owner_update" on public.notifications
  for update using (auth.uid() = user_id);

-- ── Web Push subscriptions ────────────────────────────────────────────
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  endpoint text not null,
  keys jsonb not null,                 -- { p256dh, auth }
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  unique (user_id, endpoint)
);
create index if not exists idx_push_subscriptions_user_id
  on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_subscriptions_owner_select" on public.push_subscriptions;
create policy "push_subscriptions_owner_select" on public.push_subscriptions
  for select using (auth.uid() = user_id);

drop policy if exists "push_subscriptions_owner_insert" on public.push_subscriptions;
create policy "push_subscriptions_owner_insert" on public.push_subscriptions
  for insert with check (auth.uid() = user_id);

drop policy if exists "push_subscriptions_owner_delete" on public.push_subscriptions;
create policy "push_subscriptions_owner_delete" on public.push_subscriptions
  for delete using (auth.uid() = user_id);

-- ── Backfill chain_root for existing goals ────────────────────────────
-- All existing goals become single-element chains (root = self) so the
-- view returns sensible numbers immediately. Future loop spawns set
-- loop_chain_root_id to the actual root.
update public.goals
  set loop_chain_root_id = id
  where loop_chain_root_id is null;
