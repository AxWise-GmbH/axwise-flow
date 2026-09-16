-- Mandatory two-step human confirmation for AxWise-informed goals:
-- 1. confirm customer/problem/executor context before planning
-- 2. confirm the exact execution proposal before execution

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;

ALTER TABLE public.goals ADD CONSTRAINT goals_status_check
  CHECK (status IN (
    'feasibility',
    'analyzing',
    'researching_customer',
    'awaiting_context_approval',
    'planning',
    'forming_team',
    'provisioning_tools',
    'estimating',
    'awaiting_approval',
    'active',
    'paused',
    'completed',
    'failed',
    'cancelled',
    'awaiting_tools',
    'awaiting_po_input',
    'needs_human'
  ));

COMMENT ON COLUMN public.goals.data IS
  'Goal runtime data. goal_approvals.context and goal_approvals.execution hold versioned, actor-attributed approval snapshot hashes.';
