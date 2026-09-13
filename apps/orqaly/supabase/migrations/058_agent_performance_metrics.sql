-- Agent Performance Metrics: tracks success/failure rates, costs, quality per agent.
-- Aggregated periodically from jobs + reports data.

CREATE TABLE IF NOT EXISTS public.agent_performance_metrics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id uuid NOT NULL,
  period text DEFAULT 'all_time',
  period_start timestamptz,
  jobs_completed integer DEFAULT 0,
  jobs_failed integer DEFAULT 0,
  avg_completion_ms integer DEFAULT 0,
  avg_quality_score numeric DEFAULT 0,
  total_tokens integer DEFAULT 0,
  total_cost_usd numeric DEFAULT 0,
  success_rate numeric DEFAULT 0,
  reputation_score numeric DEFAULT 50,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(agent_id, period, period_start)
);

-- RLS
ALTER TABLE public.agent_performance_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage metrics"
  ON public.agent_performance_metrics
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_agent_perf_agent ON public.agent_performance_metrics (agent_id);
CREATE INDEX idx_agent_perf_period ON public.agent_performance_metrics (period, period_start);
