-- 098_goal_status_healing.sql
-- Self-healing foundation: add `needs_human` terminal-soft status and
-- `awaiting_po_input` (which stage handlers already write via po-analysis.js:348
-- but was missing from the CHECK constraint — latent landmine).

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;

ALTER TABLE public.goals ADD CONSTRAINT goals_status_check
  CHECK (status IN (
    'feasibility',
    'analyzing',
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
    'awaiting_po_input',  -- expert-mode PO questions pending (was already written in code)
    'needs_human'         -- self-healer gave up after all strategies exhausted
  ));

-- Index to speed up the self-healer's candidate query
CREATE INDEX IF NOT EXISTS idx_goals_status_updated_at
  ON public.goals (status, updated_at)
  WHERE status NOT IN ('completed', 'cancelled', 'needs_human');
