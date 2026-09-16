-- LLM usage: entity-link columns + reliability/cache tracking + backfill.
-- Makes llm_usage the single sliceable source of truth for usage analytics
-- (by organization / consilium / goal / team / agent) and captures failed
-- calls, prompt-cache savings, latency, and activity type.
-- Run in Supabase SQL Editor (or via CLI). Additive + idempotent.

-- ── 1. Entity-link columns ──────────────────────────────────────
ALTER TABLE public.llm_usage
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS team_id         UUID,  -- goals point at concilium_teams OR agent_teams; no hard FK
  ADD COLUMN IF NOT EXISTS agent_id        TEXT,  -- agents are TEXT ids (predefined / org_agents.agent_id)
  ADD COLUMN IF NOT EXISTS agent_name      TEXT,
  ADD COLUMN IF NOT EXISTS consilium_id    TEXT REFERENCES public.concilium(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source          TEXT;

-- ── 2. Reliability / cache / activity tracking columns ──────────
ALTER TABLE public.llm_usage
  ADD COLUMN IF NOT EXISTS status        TEXT NOT NULL DEFAULT 'ok'
    CHECK (status IN ('ok', 'error', 'timeout')),
  ADD COLUMN IF NOT EXISTS error_type    TEXT,
  ADD COLUMN IF NOT EXISTS cached_tokens INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS operation     TEXT,   -- planning | execution | evaluation | ...
  ADD COLUMN IF NOT EXISTS finish_reason TEXT;

-- ── 3. Indexes for the aggregation endpoint ─────────────────────
CREATE INDEX IF NOT EXISTS idx_llm_usage_org        ON public.llm_usage(organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_team       ON public.llm_usage(team_id)         WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_agent      ON public.llm_usage(agent_id)        WHERE agent_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_consilium  ON public.llm_usage(consilium_id)    WHERE consilium_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_llm_usage_user_created ON public.llm_usage(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_usage_status     ON public.llm_usage(status)          WHERE status <> 'ok';

-- ── 4. Backfill (idempotent) ────────────────────────────────────
-- 4a. user_id from the owning goal (fixes RLS-hidden rows with null user_id).
UPDATE public.llm_usage u
   SET user_id = g.user_id
  FROM public.goals g
 WHERE u.user_id IS NULL
   AND u.goal_id = g.id
   AND g.user_id IS NOT NULL;

-- 4b. user_id from the agent job payload (owner stored as payload.user_id).
UPDATE public.llm_usage u
   SET user_id = (j.payload->>'user_id')::uuid
  FROM public.agent_jobs j
 WHERE u.user_id IS NULL
   AND u.job_id = j.id
   AND j.payload->>'user_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- 4c. organization / team / consilium from the owning goal.
UPDATE public.llm_usage u
   SET organization_id = COALESCE(u.organization_id, g.org_id),
       team_id         = COALESCE(u.team_id, g.agent_team_id, g.team_id),
       consilium_id    = COALESCE(u.consilium_id, g.concilium_id)
  FROM public.goals g
 WHERE u.goal_id = g.id
   AND (u.organization_id IS NULL OR u.team_id IS NULL OR u.consilium_id IS NULL);

-- 4d. agent_name / agent_id / source / operation from existing metadata.
UPDATE public.llm_usage u
   SET agent_name = COALESCE(u.agent_name, u.metadata->>'agent_name'),
       agent_id   = COALESCE(u.agent_id, u.metadata->>'agent_id'),
       source     = COALESCE(u.source, u.metadata->>'source'),
       operation  = COALESCE(u.operation, u.metadata->>'operation', u.metadata->>'phase')
 WHERE u.metadata IS NOT NULL
   AND (u.agent_name IS NULL OR u.agent_id IS NULL OR u.source IS NULL OR u.operation IS NULL);

-- RLS already enabled on llm_usage (031) and unchanged here. The aggregation
-- endpoint uses the service-role client and filters by user_id in code.
