-- 184_data_isolation_rls.sql
-- Part 2/2 of the data-isolation fix: replace every permissive policy with
-- strict owner scoping.
--
-- PREREQUISITE: 183_data_isolation_backfill.sql applied AND its verification
-- queries all returning 0. Applying this against un-backfilled rows makes those
-- rows invisible to everyone.
--
-- House style follows 182_partner_entities.sql — each table gets an owner policy
-- plus a service_role policy so backend workers keep working:
--   <t>_owner_all : for all using (auth.uid() = user_id) with check (...)
--   <t>_service   : for all using (auth.role() = 'service_role') with check (...)
--
-- Every historical policy name is dropped first. The names differ between 003
-- ("... own ...") and 004 ("... "), and that mismatch is precisely how the
-- permissive policies survived: 025 dropped the 003 name while 004's differently
-- named policy stayed live and kept ORing itself back in.
--
-- Idempotent: safe to re-run.

-- ── 1. team_tasks ──────────────────────────────────────────────────────────
-- The reported bug. These policies came from the SQL string embedded in
-- src/services/teamTaskBackend.js, pasted into the dashboard by hand:
--   using (auth.role() = 'authenticated')  -- ANY logged-in user, not this one
-- which is why a new account saw all 88 tasks, with write access.

alter table public.team_tasks enable row level security;

drop policy if exists "Authenticated can read team_tasks"  on public.team_tasks;
drop policy if exists "Authenticated can write team_tasks" on public.team_tasks;
drop policy if exists "team_tasks_owner_all"               on public.team_tasks;
drop policy if exists "team_tasks_service"                 on public.team_tasks;

create policy "team_tasks_owner_all" on public.team_tasks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "team_tasks_service" on public.team_tasks
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 2. partners ────────────────────────────────────────────────────────────

alter table public.partners enable row level security;

drop policy if exists "Users can manage partners"     on public.partners;  -- 004: the leak
drop policy if exists "Users can manage own partners" on public.partners;  -- 003
drop policy if exists "partners_owner_all"            on public.partners;
drop policy if exists "partners_service"              on public.partners;

create policy "partners_owner_all" on public.partners
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "partners_service" on public.partners
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 3. partner_history ─────────────────────────────────────────────────────

alter table public.partner_history enable row level security;

drop policy if exists "Users can manage partner_history"     on public.partner_history;
drop policy if exists "Users can manage own partner_history" on public.partner_history;
drop policy if exists "partner_history_owner_all"            on public.partner_history;
drop policy if exists "partner_history_service"              on public.partner_history;

create policy "partner_history_owner_all" on public.partner_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "partner_history_service" on public.partner_history
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 4. meetings ────────────────────────────────────────────────────────────

alter table public.meetings enable row level security;

drop policy if exists "Users can manage meetings"     on public.meetings;
drop policy if exists "Users can manage own meetings" on public.meetings;
drop policy if exists "meetings_owner_all"            on public.meetings;
drop policy if exists "meetings_service"              on public.meetings;

create policy "meetings_owner_all" on public.meetings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "meetings_service" on public.meetings
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 5. workflows ───────────────────────────────────────────────────────────
-- Two separate problems here.
--   a) 004 created "Users can manage workflows" FOR ALL USING
--      (auth.role() = 'authenticated') and nothing ever dropped it. Permissive
--      policies OR together, so 025's owner-only write rules have been dead
--      letters: any user could edit or delete anyone's workflows.
--   b) 025 deliberately made all workflows readable by everyone.
-- Per the isolate-everything decision, both end here: workflows become
-- owner-only. This intentionally reverses 025's design.

alter table public.workflows enable row level security;

drop policy if exists "Users can manage workflows"     on public.workflows;  -- 004: the edit hole
drop policy if exists "Users can manage own workflows" on public.workflows;  -- 003
drop policy if exists "Users can view all workflows"   on public.workflows;  -- 025: share-all read
drop policy if exists "Users can insert own workflows" on public.workflows;  -- 025
drop policy if exists "Users can update own workflows" on public.workflows;  -- 025
drop policy if exists "Users can delete own workflows" on public.workflows;  -- 025
drop policy if exists "workflows_owner_all"            on public.workflows;
drop policy if exists "workflows_service"              on public.workflows;

create policy "workflows_owner_all" on public.workflows
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workflows_service" on public.workflows
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 6. agent_jobs ──────────────────────────────────────────────────────────
-- 017 granted every authenticated user SELECT on all ~10k rows (payload holds
-- prompts). Writers all use service_role and bypass RLS, so the worker and
-- claimNextJob are unaffected.

alter table public.agent_jobs enable row level security;

drop policy if exists "Authenticated read agent_jobs"    on public.agent_jobs;
drop policy if exists "Authenticated can read agent_jobs" on public.agent_jobs;
drop policy if exists "agent_jobs_owner_all"             on public.agent_jobs;
drop policy if exists "agent_jobs_service"               on public.agent_jobs;

create policy "agent_jobs_owner_all" on public.agent_jobs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agent_jobs_service" on public.agent_jobs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 7. agent_performance_metrics ───────────────────────────────────────────
-- 058's policy is NAMED "Service role can manage metrics" but has no TO clause,
-- so it defaults to PUBLIC with USING (true) WITH CHECK (true) — any user can
-- read and forge metric rows. The name has been hiding the bug.

alter table public.agent_performance_metrics enable row level security;

drop policy if exists "Service role can manage metrics" on public.agent_performance_metrics;
drop policy if exists "agent_perf_owner_all"            on public.agent_performance_metrics;
drop policy if exists "agent_perf_service"              on public.agent_performance_metrics;

create policy "agent_perf_owner_all" on public.agent_performance_metrics
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "agent_perf_service" on public.agent_performance_metrics
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 8. prompt_versions ─────────────────────────────────────────────────────
-- Same no-TO-clause bug as 058 (097:29-31). system_prompt is user IP.
-- Prompt Lab reads/updates this with the anon key, so it needs owner scoping
-- rather than service-role-only.

alter table public.prompt_versions enable row level security;

drop policy if exists "Service role can manage prompt_versions" on public.prompt_versions;
drop policy if exists "prompt_versions_owner_all"               on public.prompt_versions;
drop policy if exists "prompt_versions_service"                 on public.prompt_versions;

create policy "prompt_versions_owner_all" on public.prompt_versions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "prompt_versions_service" on public.prompt_versions
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 9. optimization_runs ───────────────────────────────────────────────────
-- Same no-TO-clause bug (097:54-56). Deliberately a SCOPED fix: these are
-- platform-wide cron audit records (run_type, counts, cost) with no natural
-- owner, and Prompt Lab lists them with the anon key. Owner-scoping them would
-- blank that list permanently. So: close the write hole (any user could forge
-- or delete audit rows), keep reads global.

alter table public.optimization_runs enable row level security;

drop policy if exists "Service role can manage optimization_runs" on public.optimization_runs;
drop policy if exists "optimization_runs_read"                    on public.optimization_runs;
drop policy if exists "optimization_runs_service"                 on public.optimization_runs;

create policy "optimization_runs_read" on public.optimization_runs
  for select to authenticated using (true);
create policy "optimization_runs_service" on public.optimization_runs
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 10. investments (083) ──────────────────────────────────────────────────
-- Seven "*_select ... USING (true)" policies each ORed away the correct
-- "*_manage ... user_id = auth.uid()" policy on the same table.
--
-- Decision: isolate the private tables (who invested how much, investor
-- capacity/trust score, transactions, pool membership) but KEEP investment_deals
-- and investment_pools browsable — that marketplace read is intentional.

drop policy if exists "investors_select"    on public.investment_investors;
drop policy if exists "commitments_select"  on public.investment_commitments;
drop policy if exists "pool_members_select" on public.investment_pool_members;
drop policy if exists "transactions_select" on public.investment_transactions;
drop policy if exists "analytics_select"    on public.investment_deal_analytics;

-- Owner + service pair per table. 083's *_manage policies are replaced rather
-- than left in place: they use the same predicate but have no WITH CHECK, and
-- leaving two permissive policies that OR together is what caused this class of
-- bug in the first place.
do $$
declare
  t text;
begin
  foreach t in array array[
    'investment_investors', 'investment_deals', 'investment_commitments',
    'investment_pools', 'investment_pool_members', 'investment_transactions'
  ] loop
    if to_regclass('public.' || t) is null then
      raise notice '% absent - skipped', t; continue;
    end if;
    execute format('alter table public.%I enable row level security', t);
    -- 083's original name, e.g. "investors_manage" (table minus the
    -- 'investment_' prefix). Dropped so it cannot OR itself back in.
    execute format('drop policy if exists %I on public.%I',
                   replace(t, 'investment_', '') || '_manage', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner_all', t);
    execute format(
      'create policy %I on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)',
      t || '_owner_all', t);
    execute format('drop policy if exists %I on public.%I', t || '_service', t);
    execute format(
      'create policy %I on public.%I for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')',
      t || '_service', t);
  end loop;
end $$;

-- The intentional marketplace reads. Dropped and re-created (rather than left
-- untouched) so this migration is re-runnable and the grant is stated here
-- explicitly rather than inherited from 083.
drop policy if exists "deals_select" on public.investment_deals;
create policy "deals_select" on public.investment_deals
  for select to authenticated using (true);
drop policy if exists "pools_select" on public.investment_pools;
create policy "pools_select" on public.investment_pools
  for select to authenticated using (true);

-- investment_deal_analytics is owned via poster_id, not user_id.
alter table public.investment_deal_analytics enable row level security;
drop policy if exists "analytics_manage"  on public.investment_deal_analytics;
drop policy if exists "analytics_service" on public.investment_deal_analytics;
create policy "analytics_manage" on public.investment_deal_analytics
  for all using (auth.uid() = poster_id) with check (auth.uid() = poster_id);
create policy "analytics_service" on public.investment_deal_analytics
  for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- ── 11. deal_documents ─────────────────────────────────────────────────────
-- 088's deal_documents_read is FOR SELECT TO authenticated USING (true), which
-- ORs with and defeats its own owner policy — it leaks storage_path for every
-- user's pitch decks and term sheets. 088 was never applied to this project, so
-- this is guarded: an unguarded DROP POLICY on a missing table would abort the
-- whole script and roll back everything above.

do $$
begin
  if to_regclass('public.deal_documents') is not null then
    drop policy if exists deal_documents_read on public.deal_documents;
    raise notice 'deal_documents_read dropped';
  else
    raise notice 'deal_documents absent - skipped';
  end if;
end $$;

-- ── 12. job_requests ───────────────────────────────────────────────────────
-- 059:33-34 is auth.role() = 'authenticated' despite user_id existing at 059:6.
-- Also never applied to this project — same guard.

do $$
begin
  if to_regclass('public.job_requests') is null then
    raise notice 'job_requests absent - skipped'; return;
  end if;
  execute 'alter table public.job_requests enable row level security';
  execute 'drop policy if exists "Users can manage job_requests" on public.job_requests';
  execute 'drop policy if exists "job_requests_owner_all" on public.job_requests';
  execute 'drop policy if exists "job_requests_service" on public.job_requests';
  execute 'create policy "job_requests_owner_all" on public.job_requests
             for all using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  execute 'create policy "job_requests_service" on public.job_requests
             for all using (auth.role() = ''service_role'') with check (auth.role() = ''service_role'')';
end $$;

-- ── 13. Verification ───────────────────────────────────────────────────────
--
-- No user-data policy may grant access on role alone. Expect 0 rows:
--
--   select tablename, policyname, roles, cmd, qual
--     from pg_policies
--    where schemaname = 'public'
--      and tablename in ('team_tasks','partners','partner_history','meetings',
--                        'workflows','agent_jobs','prompt_versions',
--                        'agent_performance_metrics','investment_investors',
--                        'investment_commitments','investment_pool_members',
--                        'investment_transactions')
--      and (qual like '%auth.role()%authenticated%' or qual = 'true')
--    order by tablename;
--
-- Then, in the browser:
--   new account          -> Task Manager 0 tasks, Partners 0 rows, no PARTNERS nav
--   misters.builder      -> 54 tasks (NOT 88 — 31 belong to demo@orchestratori.app
--                           and 3 to vitalijs@axwise.de), 28 partners, PARTNERS nav
