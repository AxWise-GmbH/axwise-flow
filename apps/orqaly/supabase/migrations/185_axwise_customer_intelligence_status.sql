-- Durable AxWise customer/persona research sits between problem analysis and
-- operational planning. The worker yields while AxWise runs, and the goal
-- reconciler resumes this status without holding a serverless request open.

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;

ALTER TABLE public.goals ADD CONSTRAINT goals_status_check
  CHECK (status IN (
    'feasibility',
    'analyzing',
    'researching_customer',
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
