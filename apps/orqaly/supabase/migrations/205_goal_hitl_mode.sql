-- 205_goal_hitl_mode.sql
-- "Human Approve" switch on the New Goal dialog.
--
-- Two gates in the pipeline stop and wait for a person today, unconditionally:
--   customer-intelligence.js  -> awaiting_context_approval
--   client-approval.js        -> awaiting_approval
-- plus a third soft stop in feasibility-analysis.js on an "adjust" recommendation.
--
-- Nothing on the goal row expressed whether the owner wanted those pauses.
-- execution_mode is only read by feasibility-analysis, and autopilot_enabled is
-- only read by the reconciler, whose RECONCILABLE_STATUSES already excludes every
-- awaiting_* status. Hence a dedicated column.
--
-- Default is 'checkpoints' so every existing goal, and every non-dialog caller
-- (assistant bridge, pulses, loop continuations), keeps today's behaviour. Only
-- callers that opt in explicitly get unattended runs.
alter table public.goals
  add column if not exists hitl_mode text not null default 'checkpoints';

alter table public.goals drop constraint if exists goals_hitl_mode_check;
alter table public.goals add constraint goals_hitl_mode_check
  check (hitl_mode in ('unattended', 'checkpoints'));

comment on column public.goals.hitl_mode is
  'unattended = the pipeline approves its own gates on the owner''s behalf, still failing closed on research-quality and execution-authorization failures; checkpoints = both human gates require an explicit user action.';

-- Supports a future sweeper that recovers unattended goals whose auto-approval
-- job was lost. Costs nothing today: partial index over a tiny slice.
create index if not exists idx_goals_hitl_mode_status
  on public.goals (hitl_mode, status)
  where hitl_mode = 'unattended'
    and status in ('awaiting_context_approval', 'awaiting_approval');
