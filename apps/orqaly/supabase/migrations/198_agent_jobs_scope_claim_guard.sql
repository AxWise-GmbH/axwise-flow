-- Migration 196 partitions inserts, but an older worker that does not filter
-- by worker_scope can still attempt to claim a Preview or local row. Enforce
-- the partition at the database transition boundary so mixed-generation
-- workers sharing this Supabase project cannot cross-claim queued work.

create or replace function public.agent_jobs_guard_worker_scope_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_headers jsonb := '{}'::jsonb;
  requested_scope text;
begin
  -- Only guard the queue lease transition. Finalization/recovery retains its
  -- existing behavior, and SQL maintenance that does not claim a job remains
  -- unaffected.
  if old.status is distinct from 'queued' or new.status is distinct from 'running' then
    return new;
  end if;

  begin
    request_headers := coalesce(
      nullif(current_setting('request.headers', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    request_headers := '{}'::jsonb;
  end;

  requested_scope := lower(coalesce(request_headers ->> 'x-orqaly-worker-scope', ''));
  if requested_scope not in ('production', 'preview', 'local') then
    -- Headerless legacy workers are production-only. This preserves their
    -- production queue while preventing them from consuming Preview/local.
    requested_scope := 'production';
  end if;

  if old.worker_scope is distinct from requested_scope then
    raise exception using
      errcode = '42501',
      message = format(
        'worker scope %s cannot claim %s job %s',
        requested_scope,
        old.worker_scope,
        old.id
      );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_agent_jobs_guard_worker_scope_claim on public.agent_jobs;
create trigger trg_agent_jobs_guard_worker_scope_claim
  before update of status on public.agent_jobs
  for each row execute function public.agent_jobs_guard_worker_scope_claim();

comment on function public.agent_jobs_guard_worker_scope_claim() is
  'Prevents headerless/legacy workers from claiming jobs outside their runtime partition.';
