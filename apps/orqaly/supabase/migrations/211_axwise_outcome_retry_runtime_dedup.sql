-- Migration 191 globally deduplicated active AxWise outcome retries by goal.
-- Preview deployments share one database and worker_scope, but are isolated by
-- payload._workerDeployment. Keep one active retry per exact runtime: one per
-- Production/local scope, and one per immutable Preview deployment identity.

create unique index if not exists idx_agent_jobs_active_axwise_outcome_runtime
  on public.agent_jobs (
    (payload ->> 'goalId'),
    worker_scope,
    (
      case
        when worker_scope = 'preview'
          then coalesce(payload ->> '_workerDeployment', '')
        else ''
      end
    )
  )
  where status in ('queued', 'running')
    and payload ->> 'type' = 'axwise-outcome'
    and payload ? 'goalId';

drop index if exists public.idx_agent_jobs_active_axwise_outcome_goal;

comment on index public.idx_agent_jobs_active_axwise_outcome_runtime is
  'Prevents duplicate active AxWise outcome retries within one exact worker runtime while isolating Preview deployments.';
