-- Reserve the second human approval while the approved execution snapshot is
-- bound to every task. The transient state prevents concurrent approval
-- requests from authorizing the same proposal twice.

alter table public.goals drop constraint if exists goals_status_check;

alter table public.goals add constraint goals_status_check
  check (status in (
    'draft',
    'feasibility',
    'analyzing',
    'researching_customer',
    'awaiting_context_approval',
    'planning',
    'forming_team',
    'provisioning_tools',
    'estimating',
    'awaiting_approval',
    'authorizing_execution',
    'active',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'awaiting_tools',
    'awaiting_po_input',
    'needs_human'
  ));

comment on column public.goals.status is
  'Goal lifecycle status. authorizing_execution is a transient CAS reservation while the approved execution snapshot is bound to tasks.';
