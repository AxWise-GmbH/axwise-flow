-- Keep scope-bound textual deliverables non-terminal while the exact final
-- artifact is bound to deterministic validators and an independent semantic
-- attestation. The state is transient: successful validation moves to
-- completed; failed repair moves to the existing needs_human recovery state.

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
    'pending_validation',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'awaiting_tools',
    'awaiting_po_input',
    'needs_human'
  ));

comment on column public.goals.status is
  'Goal lifecycle status. authorizing_execution reserves approval binding; pending_validation reserves scope-bound final-artifact quality attestation.';
