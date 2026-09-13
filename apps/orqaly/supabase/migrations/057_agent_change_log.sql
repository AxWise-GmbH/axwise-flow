-- Agent Change Log: snapshot-before-write pattern for agent write operations.
-- Enables rollback of any data change made by an agent.

CREATE TABLE IF NOT EXISTS public.agent_change_log (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL,
  user_id uuid NOT NULL,
  tool_id text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  previous_state jsonb NOT NULL,
  new_state jsonb NOT NULL,
  rolled_back boolean DEFAULT false,
  rolled_back_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.agent_change_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent changes"
  ON public.agent_change_log
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert agent changes"
  ON public.agent_change_log
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can rollback own agent changes"
  ON public.agent_change_log
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_agent_change_log_agent ON public.agent_change_log (agent_id);
CREATE INDEX idx_agent_change_log_user ON public.agent_change_log (user_id);
CREATE INDEX idx_agent_change_log_entity ON public.agent_change_log (entity_type, entity_id);
CREATE INDEX idx_agent_change_log_created ON public.agent_change_log (created_at DESC);
