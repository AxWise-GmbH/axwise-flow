-- At most one active manually requested full Osja review may run for a goal
-- in a worker partition. Scoping this new guard to the manualRetry marker
-- guarantees a clean online index build even if historical automatic review
-- jobs overlap. The API still checks every active full review (automatic or
-- manual) before inserting. Single-deliverable regeneration reviews remain
-- independent and are excluded from this guard.

create unique index if not exists idx_agent_jobs_active_full_osja_review
  on public.agent_jobs ((payload ->> 'goalId'), worker_scope)
  where status in ('queued', 'running')
    and payload ->> 'type' = 'orchestrate-goal'
    and payload ->> 'action' = 'osja-review'
    and payload ->> 'manualRetry' = 'true'
    and payload ? 'goalId'
    and not (payload ? 'singleDeliverableId');

comment on index public.idx_agent_jobs_active_full_osja_review is
  'Prevents duplicate active full Osja quality-review jobs per goal and worker partition.';
