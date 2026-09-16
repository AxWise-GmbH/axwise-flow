-- 071: Add 'awaiting_tools' status to goals
-- When a goal plan requires tools the user hasn't configured,
-- the pipeline pauses with this status until keys are provided.

ALTER TABLE public.goals DROP CONSTRAINT IF EXISTS goals_status_check;
ALTER TABLE public.goals ADD CONSTRAINT goals_status_check
  CHECK (status IN ('planning', 'active', 'paused', 'completed', 'failed', 'cancelled', 'awaiting_tools'));
