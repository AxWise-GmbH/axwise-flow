-- ============================================================
-- 094_pulse.sql — Pulse: Autonomous Agent Scheduling & Learning
-- ============================================================

-- Pulse fields on concilium_agents
ALTER TABLE concilium_agents ADD COLUMN IF NOT EXISTS pulse_goal_id UUID;
ALTER TABLE concilium_agents ADD COLUMN IF NOT EXISTS pulse_task_focus TEXT;
ALTER TABLE concilium_agents ADD COLUMN IF NOT EXISTS pulse_enabled BOOLEAN DEFAULT false;
ALTER TABLE concilium_agents ADD COLUMN IF NOT EXISTS pulse_mode TEXT DEFAULT 'lite';
ALTER TABLE concilium_agents ADD COLUMN IF NOT EXISTS pulse_cycle_budget INTEGER DEFAULT 10000;
ALTER TABLE concilium_agents ADD COLUMN IF NOT EXISTS autonomous_enabled BOOLEAN DEFAULT false;
ALTER TABLE concilium_agents ADD COLUMN IF NOT EXISTS pulse_cycle_count INTEGER DEFAULT 0;
ALTER TABLE concilium_agents ADD COLUMN IF NOT EXISTS pulse_best_score NUMERIC;
ALTER TABLE concilium_agents ADD COLUMN IF NOT EXISTS next_pulse_at TIMESTAMPTZ;

-- Pulse cycle log (autoresearch results.tsv equivalent)
CREATE TABLE IF NOT EXISTS pulse_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  agent_id UUID NOT NULL,
  goal_id UUID,
  cycle_number INTEGER NOT NULL,
  quality_score NUMERIC,
  previous_best_score NUMERIC,
  status TEXT NOT NULL DEFAULT 'keep',
  description TEXT,
  result_summary TEXT,
  tokens_used INTEGER DEFAULT 0,
  cost_usd NUMERIC DEFAULT 0,
  duration_ms INTEGER,
  learning_entry TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pulse_cycles_agent
  ON pulse_cycles(agent_id, created_at DESC);

ALTER TABLE pulse_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pulse cycles" ON pulse_cycles
  FOR ALL USING (user_id = auth.uid());

-- Pulse triggers table (connection → agent routing)
CREATE TABLE IF NOT EXISTS pulse_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  connection_id UUID,
  agent_id UUID NOT NULL,
  goal_id UUID,
  trigger_type TEXT DEFAULT 'webhook',
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE pulse_triggers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own pulse triggers" ON pulse_triggers
  FOR ALL USING (user_id = auth.uid());

-- Index for Pulse cron query (fast detection of due agents)
CREATE INDEX IF NOT EXISTS idx_pulse_agents_due
  ON concilium_agents(next_pulse_at)
  WHERE pulse_enabled = true;
