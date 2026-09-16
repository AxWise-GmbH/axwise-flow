-- Partition the shared agent_jobs queue by runtime. Production, Preview, and
-- local workers can use the same Supabase project without claiming one
-- another's jobs or executing with the wrong AxWise configuration.

alter table public.agent_jobs
  add column if not exists worker_scope text not null default 'production';

alter table public.agent_jobs
  drop constraint if exists agent_jobs_worker_scope_check;

alter table public.agent_jobs
  add constraint agent_jobs_worker_scope_check
  check (worker_scope in ('production', 'preview', 'local'));

create index if not exists idx_agent_jobs_worker_scope_status_created
  on public.agent_jobs(worker_scope, status, created_at);

comment on column public.agent_jobs.worker_scope is
  'Queue partition derived from the trusted x-orqaly-worker-scope service-role header. local_only goals always route to local.';

create or replace function public.agent_jobs_set_worker_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_headers jsonb := '{}'::jsonb;
  requested_scope text;
  target_goal_id uuid;
  target_local_only boolean := false;
begin
  begin
    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    request_headers := '{}'::jsonb;
  end;

  requested_scope := lower(coalesce(request_headers ->> 'x-orqaly-worker-scope', ''));

  target_goal_id := public.try_uuid(new.payload ->> 'goalId');
  if target_goal_id is null then
    target_goal_id := public.try_uuid(new.payload ->> 'parentGoalId');
  end if;
  if target_goal_id is null and nullif(new.payload ->> 'taskId', '') is not null then
    select public.try_uuid(t.data ->> 'goal_id')
      into target_goal_id
      from public.team_tasks t
     where t.id = new.payload ->> 'taskId';
  end if;

  if target_goal_id is not null then
    select coalesce(g.data @> '{"local_only": true}'::jsonb, false)
      into target_local_only
      from public.goals g
     where g.id = target_goal_id;
  end if;

  if target_local_only then
    new.worker_scope := 'local';
  elsif requested_scope in ('production', 'preview', 'local') then
    new.worker_scope := requested_scope;
  else
    -- Calls from an older production deployment do not carry the header. Keep
    -- those safe and backwards compatible while the release rolls out.
    new.worker_scope := coalesce(new.worker_scope, 'production');
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agent_jobs_set_worker_scope on public.agent_jobs;
create trigger trg_agent_jobs_set_worker_scope
  before insert on public.agent_jobs
  for each row execute function public.agent_jobs_set_worker_scope();

-- Existing rows predate the runtime header. Preserve normal production work,
-- then move any queued/running local_only goal work to the local partition.
update public.agent_jobs
   set worker_scope = 'production'
 where worker_scope is null;

update public.agent_jobs j
   set worker_scope = 'local'
  from public.goals g
 where j.status in ('queued', 'running')
   and g.id = coalesce(
     public.try_uuid(j.payload ->> 'goalId'),
     public.try_uuid(j.payload ->> 'parentGoalId')
   )
   and coalesce(g.data @> '{"local_only": true}'::jsonb, false);

update public.agent_jobs j
   set worker_scope = 'local'
  from public.team_tasks t
  join public.goals g on g.id = public.try_uuid(t.data ->> 'goal_id')
 where j.status in ('queued', 'running')
   and t.id = j.payload ->> 'taskId'
   and coalesce(g.data @> '{"local_only": true}'::jsonb, false);
