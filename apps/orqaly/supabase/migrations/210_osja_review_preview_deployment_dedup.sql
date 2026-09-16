-- Migration 201 deduplicated manual full Osja reviews by (goal, worker_scope).
-- Every Vercel Preview shares worker_scope = 'preview', so an active review
-- owned by Preview A incorrectly blocked the same goal in Preview B even
-- though Preview B is forbidden from claiming A's deployment-bound row.
-- Preserve one active review per production/local scope while making Preview
-- uniqueness exact to its immutable `_workerDeployment` binding.

drop index if exists public.idx_agent_jobs_active_full_osja_review;

create unique index idx_agent_jobs_active_full_osja_review
  on public.agent_jobs (
    (payload ->> 'goalId'),
    worker_scope,
    (
      case
        when worker_scope = 'preview' then
          coalesce(nullif(payload ->> '_workerDeployment', ''), '__unbound_preview__')
        else '__worker_scope__'
      end
    )
  )
  where status in ('queued', 'running')
    and payload ->> 'type' = 'orchestrate-goal'
    and payload ->> 'action' = 'osja-review'
    and payload ->> 'manualRetry' = 'true'
    and payload ? 'goalId'
    and not (payload ? 'singleDeliverableId');

comment on index public.idx_agent_jobs_active_full_osja_review is
  'Prevents duplicate active full Osja reviews per goal and exact Preview deployment; production/local remain deduplicated per worker scope.';
