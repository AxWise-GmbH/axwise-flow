-- Prompt Optimization Agent: version tracking, A/B testing, and optimization audit trail.

-- ── prompt_versions ─────────────────────────────────────────────────────────
-- Stores every prompt variant created by the optimizer, testing state, and perf.

CREATE TABLE IF NOT EXISTS public.prompt_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  blueprint_id UUID REFERENCES public.agent_blueprints(id),
  version INTEGER NOT NULL,
  variant_label TEXT NOT NULL DEFAULT 'base',
  system_prompt TEXT NOT NULL,
  change_summary TEXT,
  optimization_strategy TEXT,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft','testing','active','archived','rejected')),
  baseline_metrics JSONB,
  test_metrics JSONB,
  test_task_count INTEGER DEFAULT 0,
  created_by TEXT DEFAULT 'prompt-optimization-agent',
  created_at TIMESTAMPTZ DEFAULT now(),
  promoted_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  UNIQUE(agent_id, version, variant_label)
);

ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage prompt_versions"
  ON public.prompt_versions FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_pv_agent_status ON public.prompt_versions(agent_id, status);
CREATE INDEX idx_pv_testing ON public.prompt_versions(status) WHERE status = 'testing';

-- ── optimization_runs ───────────────────────────────────────────────────────
-- Audit trail for each 24h improvement / 72h evaluation cycle.

CREATE TABLE IF NOT EXISTS public.optimization_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type TEXT NOT NULL CHECK (run_type IN ('improvement','evaluation')),
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  agents_analyzed INTEGER DEFAULT 0,
  agents_optimized INTEGER DEFAULT 0,
  report JSONB,
  total_cost_usd NUMERIC(10,6) DEFAULT 0,
  strategy_outcomes JSONB
);

ALTER TABLE public.optimization_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage optimization_runs"
  ON public.optimization_runs FOR ALL
  USING (true) WITH CHECK (true);

CREATE INDEX idx_opt_runs_type ON public.optimization_runs(run_type, started_at DESC);

-- ── team_tasks: add variant tracking column ─────────────────────────────────

ALTER TABLE public.team_tasks
  ADD COLUMN IF NOT EXISTS prompt_version_id UUID REFERENCES public.prompt_versions(id);
