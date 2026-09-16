-- Migration 199 made worker_scope a database lease invariant. Preview is a
-- shared scope, however, so a stale or compromised Preview worker could still
-- lease another deployment's row unless the immutable deployment binding is
-- checked at the same queued -> running transition.

-- Rows created by an older Preview deployment have no trustworthy immutable
-- deployment provenance, so they cannot be reassigned safely at cutover. Mark
-- them terminal before enforcing the lease guard instead of leaving work that
-- no Preview deployment can ever claim. Operators can inspect/retry the failed
-- row explicitly after confirming the intended deployment.
UPDATE public.agent_jobs
SET
  status = 'failed',
  error = COALESCE(
    error,
    'Legacy unbound Preview job quarantined during deployment-isolated worker rollout'
  ),
  updated_at = clock_timestamp()
WHERE worker_scope = 'preview'
  AND status = 'queued'
  AND NULLIF(BTRIM(COALESCE(payload ->> '_workerDeployment', '')), '') IS NULL;

create or replace function public.agent_jobs_guard_worker_scope_claim()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_headers jsonb := '{}'::jsonb;
  requested_scope text;
  requested_deployment text;
  bound_deployment text;
begin
  -- Only guard queue leasing. Finalization and recovery updates retain their
  -- existing behavior; their application queries use the same exact binding.
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
      message = format('worker scope header is required to claim job %s', old.id);
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

  if old.worker_scope = 'preview' then
    requested_deployment := nullif(
      btrim(coalesce(request_headers ->> 'x-orqaly-worker-deployment', '')),
      ''
    );
    bound_deployment := nullif(
      btrim(coalesce(old.payload ->> '_workerDeployment', '')),
      ''
    );

    if requested_deployment is null then
      raise exception using
        errcode = '42501',
        message = format('worker deployment header is required to claim Preview job %s', old.id);
    end if;

    if bound_deployment is null then
      raise exception using
        errcode = '42501',
        message = format('Preview job %s has no deployment binding', old.id);
    end if;

    if bound_deployment is distinct from requested_deployment then
      raise exception using
        errcode = '42501',
        message = format(
          'worker deployment %s cannot claim Preview deployment %s job %s',
          requested_deployment,
          bound_deployment,
          old.id
        );
    end if;
  end if;

  return new;
end;
$$;

comment on function public.agent_jobs_guard_worker_scope_claim() is
  'Requires trusted worker scope for every lease and exact deployment identity for Preview leases.';
