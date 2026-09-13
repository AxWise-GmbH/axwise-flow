-- 093: Agent reporting structure, schedule, and permissions display
-- Adds: reports_to (who the agent reports to), report_schedule (how often),
-- permissions (explicit read/write scopes for domain tools)

-- Concilium agents (operational agents)
ALTER TABLE public.concilium_agents ADD COLUMN IF NOT EXISTS reports_to TEXT DEFAULT NULL;
ALTER TABLE public.concilium_agents ADD COLUMN IF NOT EXISTS report_schedule TEXT DEFAULT 'every_check_in'
  CHECK (report_schedule IN ('every_check_in', 'hourly', 'daily', 'on_completion', 'manual'));

-- Agent hub agents (workforce agents)
ALTER TABLE public.agent_hub_agents ADD COLUMN IF NOT EXISTS reports_to TEXT DEFAULT NULL;
ALTER TABLE public.agent_hub_agents ADD COLUMN IF NOT EXISTS report_schedule TEXT DEFAULT 'every_check_in';
ALTER TABLE public.agent_hub_agents ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '[]';
