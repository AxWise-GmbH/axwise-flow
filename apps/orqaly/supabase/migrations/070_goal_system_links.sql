-- 070: Goal system links — connect goals to projects, workflows, and add Agile fields
-- Supports unified request/goal system with PO validation, PM planning, review gates

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS project_id TEXT;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS workflow_id TEXT;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'auto'
  CHECK (execution_mode IN ('auto', 'manual'));
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS parsed_category TEXT;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS parsed_priority TEXT DEFAULT 'medium';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS parsed_requirements TEXT DEFAULT '';
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS complexity TEXT DEFAULT 'simple'
  CHECK (complexity IN ('simple', 'complex'));
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 0;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS source_request_id TEXT;

-- Time tracking per phase
ALTER TABLE public.goal_log ADD COLUMN IF NOT EXISTS phase_index INTEGER;
ALTER TABLE public.goal_log ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
