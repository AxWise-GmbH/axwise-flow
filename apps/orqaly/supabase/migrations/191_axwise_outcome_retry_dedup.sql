-- AxWise Phase 4 outcome delivery retries must have at most one active chain
-- per goal. Application-level read-before-insert avoids normal conflicts; this
-- partial unique index closes the concurrent-worker race.

create unique index if not exists idx_agent_jobs_active_axwise_outcome_goal
  on public.agent_jobs ((payload ->> 'goalId'))
  where status in ('queued', 'running')
    and payload ->> 'type' = 'axwise-outcome'
    and payload ? 'goalId';

comment on index public.idx_agent_jobs_active_axwise_outcome_goal is
  'Prevents duplicate active AxWise Phase 4 outcome retry jobs for one goal.';
