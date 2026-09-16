-- Repair the two client-side Job Pool persistence tables that may be absent on
-- projects where the early UI migrations were skipped. These are deliberately
-- separate from agent_teams, which is the goal-execution workforce model.

create table if not exists public.job_requests (
  id                       text primary key,
  user_id                  uuid not null references auth.users(id) on delete cascade,
  request_text             text not null default '',
  status                   text not null default 'pending'
                             check (status in ('pending', 'processing', 'completed', 'rejected')),
  parsed_title             text,
  parsed_category          text,
  parsed_requirements      text,
  parsed_priority          text default 'medium'
                             check (parsed_priority in ('low', 'medium', 'high', 'urgent')),
  assigned_concilium_id    text,
  assigned_concilium_name  text default '',
  result_job_id            text,
  result_agent_id          text,
  processing_notes         text default '',
  cost_usd                 numeric(10, 4) default 0,
  data                     jsonb not null default '{}'::jsonb,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists idx_job_requests_user_id
  on public.job_requests(user_id);
create index if not exists idx_job_requests_status
  on public.job_requests(status);
create index if not exists idx_job_requests_priority
  on public.job_requests(parsed_priority);
create index if not exists idx_job_requests_created_at
  on public.job_requests(created_at desc);

alter table public.job_requests enable row level security;
drop policy if exists "Users can manage job_requests" on public.job_requests;
drop policy if exists job_requests_owner_all on public.job_requests;
drop policy if exists job_requests_service on public.job_requests;
create policy job_requests_owner_all on public.job_requests
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy job_requests_service on public.job_requests
  for all to service_role
  using (true)
  with check (true);

-- Job Pool / Agent Hub user-authored team catalogue. The app stores agent
-- references as JSON because these teams can mix predefined and user agents.
create table if not exists public.teams (
  id               text primary key,
  user_id          uuid not null references auth.users(id) on delete cascade,
  name             text not null default '',
  description      text not null default '',
  status           text not null default 'active'
                     check (status in ('active', 'paused', 'disbanded')),
  agents           jsonb not null default '[]'::jsonb,
  created_by_id    text,
  created_by_name  text not null default '',
  data             jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_teams_user_created
  on public.teams(user_id, created_at desc);
create index if not exists idx_teams_user_status
  on public.teams(user_id, status);

alter table public.teams enable row level security;
drop policy if exists teams_owner_all on public.teams;
drop policy if exists teams_service on public.teams;
create policy teams_owner_all on public.teams
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
create policy teams_service on public.teams
  for all to service_role
  using (true)
  with check (true);

grant select, insert, update, delete on public.job_requests to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant all on public.job_requests to service_role;
grant all on public.teams to service_role;
