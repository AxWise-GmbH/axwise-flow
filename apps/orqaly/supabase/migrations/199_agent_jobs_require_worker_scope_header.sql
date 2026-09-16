-- Migration 198 preserved headerless workers by treating them as Production.
-- That compatibility window lets an older local worker claim a Production job
-- and execute it with local-only credentials (for example Claude Code). Every
-- supported runtime now sends x-orqaly-worker-scope, so fail closed at the
-- queued -> running lease boundary when that trusted header is absent.

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
  -- Only guard queue leasing. Finalization and recovery updates retain their
  -- existing behavior, and SQL maintenance that does not claim a job is not
  -- affected.
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
    raise exception using
      errcode = '42501',
      message = format(
        'worker scope header is required to claim job %s',
        old.id
      );
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

comment on function public.agent_jobs_guard_worker_scope_claim() is
  'Requires an explicit trusted runtime scope and prevents cross-partition queue claims.';
