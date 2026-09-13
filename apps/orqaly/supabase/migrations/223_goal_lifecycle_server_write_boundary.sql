-- 223_goal_lifecycle_server_write_boundary.sql
--
-- Make goal lifecycle state server-authored without breaking the browser's
-- manual Job Pool and Task Manager CRUD.  Authenticated owners may read every
-- one of their rows, but may mutate jobs/team_tasks only while a row is wholly
-- unbound from a goal materialization attempt.
--
-- RLS policies are permissive (ORed) by default.  Adding a restrictive-looking
-- policy beside an older FOR ALL policy would therefore leave the old write
-- path open.  Replace the complete policy set on these five tables so the
-- boundary is deterministic even when an installation has historical or
-- dashboard-created policy names.
--
-- Idempotent: safe to re-run.

begin;

alter table public.goals enable row level security;
alter table public.goal_log enable row level security;
alter table public.goal_messages enable row level security;
alter table public.team_tasks enable row level security;
alter table public.jobs enable row level security;

do $policy_reset$
declare
  target record;
begin
  for target in
    select policy.tablename, policy.policyname
      from pg_catalog.pg_policies as policy
     where policy.schemaname = 'public'
       and policy.tablename in (
         'goals',
         'goal_log',
         'goal_messages',
         'team_tasks',
         'jobs'
       )
  loop
    execute pg_catalog.format(
      'drop policy %I on public.%I',
      target.policyname,
      target.tablename
    );
  end loop;
end
$policy_reset$;

-- ── Goal lifecycle: owner reads, trusted server writes ────────────────────

create policy "goals_owner_select" on public.goals
  for select to authenticated
  using (user_id = auth.uid());

create policy "goals_service" on public.goals
  for all to service_role
  using (true)
  with check (true);

create policy "goal_log_owner_select" on public.goal_log
  for select to authenticated
  using (
    exists (
      select 1
        from public.goals as goal
       where goal.id = goal_log.goal_id
         and goal.user_id = auth.uid()
    )
  );

create policy "goal_log_service" on public.goal_log
  for all to service_role
  using (true)
  with check (true);

create policy "goal_messages_owner_select" on public.goal_messages
  for select to authenticated
  using (
    exists (
      select 1
        from public.goals as goal
       where goal.id = goal_messages.goal_id
         and goal.user_id = auth.uid()
    )
  );

create policy "goal_messages_service" on public.goal_messages
  for all to service_role
  using (true)
  with check (true);

-- ── Team tasks: all owner reads, manual/unbound owner writes ──────────────
--
-- A manual row has no typed goal binding, no JSON goal binding, and neither
-- form of materialization-attempt binding.  The UPDATE policy applies the
-- complete predicate to both OLD (USING) and NEW (WITH CHECK), so a browser
-- cannot detach a server-owned row or promote a manual row into lifecycle
-- state.

create policy "team_tasks_owner_select" on public.team_tasks
  for select to authenticated
  using (user_id = auth.uid());

create policy "team_tasks_owner_manual_insert" on public.team_tasks
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and goal_id is null
    and not (coalesce(data, '{}'::jsonb) ? 'goal_id')
    and materialization_attempt is null
    and not (coalesce(data, '{}'::jsonb) ? 'materialization_attempt')
  );

create policy "team_tasks_owner_manual_update" on public.team_tasks
  for update to authenticated
  using (
    user_id = auth.uid()
    and goal_id is null
    and not (coalesce(data, '{}'::jsonb) ? 'goal_id')
    and materialization_attempt is null
    and not (coalesce(data, '{}'::jsonb) ? 'materialization_attempt')
  )
  with check (
    user_id = auth.uid()
    and goal_id is null
    and not (coalesce(data, '{}'::jsonb) ? 'goal_id')
    and materialization_attempt is null
    and not (coalesce(data, '{}'::jsonb) ? 'materialization_attempt')
  );

create policy "team_tasks_owner_manual_delete" on public.team_tasks
  for delete to authenticated
  using (
    user_id = auth.uid()
    and goal_id is null
    and not (coalesce(data, '{}'::jsonb) ? 'goal_id')
    and materialization_attempt is null
    and not (coalesce(data, '{}'::jsonb) ? 'materialization_attempt')
  );

create policy "team_tasks_service" on public.team_tasks
  for all to service_role
  using (true)
  with check (true);

-- ── Jobs: all owner reads, manual/unbound owner writes ────────────────────

create policy "jobs_owner_select" on public.jobs
  for select to authenticated
  using (user_id = auth.uid());

create policy "jobs_owner_manual_insert" on public.jobs
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and goal_id is null
    and not (coalesce(data, '{}'::jsonb) ? 'goal_id')
    and materialization_attempt is null
    and not (coalesce(data, '{}'::jsonb) ? 'materialization_attempt')
  );

create policy "jobs_owner_manual_update" on public.jobs
  for update to authenticated
  using (
    user_id = auth.uid()
    and goal_id is null
    and not (coalesce(data, '{}'::jsonb) ? 'goal_id')
    and materialization_attempt is null
    and not (coalesce(data, '{}'::jsonb) ? 'materialization_attempt')
  )
  with check (
    user_id = auth.uid()
    and goal_id is null
    and not (coalesce(data, '{}'::jsonb) ? 'goal_id')
    and materialization_attempt is null
    and not (coalesce(data, '{}'::jsonb) ? 'materialization_attempt')
  );

create policy "jobs_owner_manual_delete" on public.jobs
  for delete to authenticated
  using (
    user_id = auth.uid()
    and goal_id is null
    and not (coalesce(data, '{}'::jsonb) ? 'goal_id')
    and materialization_attempt is null
    and not (coalesce(data, '{}'::jsonb) ? 'materialization_attempt')
  );

create policy "jobs_service" on public.jobs
  for all to service_role
  using (true)
  with check (true);

-- Table privileges mirror the policy boundary.  This is deliberate defence in
-- depth: lifecycle writes fail at the grant layer as well as at RLS, while the
-- two existing browser-managed tables retain exactly their CRUD privileges.

revoke all privileges on table
  public.goals,
  public.goal_log,
  public.goal_messages,
  public.team_tasks,
  public.jobs
from public, anon, authenticated;

grant select on table
  public.goals,
  public.goal_log,
  public.goal_messages,
  public.team_tasks,
  public.jobs
to authenticated;

grant insert, update, delete on table
  public.team_tasks,
  public.jobs
to authenticated;

grant all privileges on table
  public.goals,
  public.goal_log,
  public.goal_messages,
  public.team_tasks,
  public.jobs
to service_role;

comment on policy "goals_owner_select" on public.goals is
  'Authenticated owners may read goal lifecycle state; only the service role may mutate it.';

comment on policy "team_tasks_owner_manual_update" on public.team_tasks is
  'Authenticated owners may update only rows that remain wholly unbound from goal/materialization state.';

comment on policy "jobs_owner_manual_update" on public.jobs is
  'Authenticated owners may update only rows that remain wholly unbound from goal/materialization state.';

commit;
