-- agent_jobs is an internal worker queue, not a browser-owned resource.
-- Migration 184 correctly owner-scoped visibility but its FOR ALL owner
-- policy also let any authenticated owner forge payloads, reset leases, or
-- delete durable work through the public PostgREST API. Keep owner polling
-- read-only and reserve every mutation for the service-role worker boundary.

alter table public.agent_jobs enable row level security;

drop policy if exists "Authenticated read agent_jobs" on public.agent_jobs;
drop policy if exists "Authenticated can read agent_jobs" on public.agent_jobs;
drop policy if exists "agent_jobs_owner_all" on public.agent_jobs;
drop policy if exists "agent_jobs_owner_select" on public.agent_jobs;
drop policy if exists "agent_jobs_service" on public.agent_jobs;

create policy "agent_jobs_owner_select" on public.agent_jobs
  for select to authenticated
  using (auth.uid() = user_id);

create policy "agent_jobs_service" on public.agent_jobs
  for all to service_role
  using (true)
  with check (true);

-- Table privileges are checked before RLS. Revoke every browser-facing table
-- capability first, then restore authenticated status/result polling only.
-- PUBLIC is included so a future inherited grant cannot reopen queue writes.
revoke select, insert, update, delete, truncate, references, trigger
  on table public.agent_jobs from public, anon, authenticated;
grant select on table public.agent_jobs to authenticated;

-- Supabase service-role clients and trusted internal workers retain the full
-- queue lifecycle. Direct postgres/database-owner maintenance is unaffected.
grant all privileges on table public.agent_jobs to service_role;

comment on policy "agent_jobs_owner_select" on public.agent_jobs is
  'Authenticated owners may poll their own queue rows but cannot create, lease, mutate, or delete jobs.';
