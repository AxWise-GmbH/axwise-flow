-- Concilium v2 schema: members, criteria, consensus rules, permissions, action registry
-- Phase 2: Schema Foundation — extend boards, add member profiles + evaluation criteria

-- ── 1. Extend existing concilium table ────────────────────────────────

ALTER TABLE public.concilium
  ADD COLUMN IF NOT EXISTS uuid_id             UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS legacy_id           TEXT,
  ADD COLUMN IF NOT EXISTS security_level      TEXT DEFAULT 'standard'
    CHECK (security_level IN ('minimal', 'standard', 'strict', 'paranoid')),
  ADD COLUMN IF NOT EXISTS description         TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS approval_threshold  NUMERIC(3,2) DEFAULT 0.60,
  ADD COLUMN IF NOT EXISTS confidence_threshold NUMERIC(3,2) DEFAULT 0.70,
  ADD COLUMN IF NOT EXISTS auto_quarantine_on_violation BOOLEAN DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS idx_concilium_uuid_id ON public.concilium(uuid_id);

-- Fix overly broad RLS: replace "authenticated can do all" with user-scoped
DROP POLICY IF EXISTS "Users can manage concilium" ON public.concilium;
DROP POLICY IF EXISTS "Users manage own concilium" ON public.concilium;
DROP POLICY IF EXISTS "Service role manages all concilium" ON public.concilium;

CREATE POLICY "Users manage own concilium"
  ON public.concilium FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all concilium"
  ON public.concilium FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 2. Concilium Members ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.concilium_members (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concilium_id    TEXT NOT NULL REFERENCES public.concilium(id) ON DELETE CASCADE,

  -- Identity
  name            TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'evaluator'
    CHECK (role IN ('chairman', 'evaluator', 'auditor', 'specialist', 'observer')),
  resume          TEXT DEFAULT '',
  skills          JSONB NOT NULL DEFAULT '[]',
  comments        JSONB NOT NULL DEFAULT '[]',

  -- LLM configuration
  provider        TEXT NOT NULL DEFAULT 'groq'
    CHECK (provider IN ('groq', 'openai', 'anthropic', 'deepseek', 'glm')),
  model           TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
  temperature     NUMERIC(3,2) DEFAULT 0.7,
  max_tokens      INTEGER DEFAULT 4096,

  -- Performance tracking
  total_evaluations    INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER NOT NULL DEFAULT 0,
  avg_cost_usd         NUMERIC(10,8) NOT NULL DEFAULT 0,
  total_tokens_used    BIGINT NOT NULL DEFAULT 0,

  -- Status
  active          BOOLEAN NOT NULL DEFAULT true,
  quarantined     BOOLEAN NOT NULL DEFAULT false,
  quarantine_reason TEXT,
  quarantined_at  TIMESTAMPTZ,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_concilium_members_user_id      ON public.concilium_members(user_id);
CREATE INDEX idx_concilium_members_concilium_id ON public.concilium_members(concilium_id);
CREATE INDEX idx_concilium_members_provider     ON public.concilium_members(provider);
CREATE INDEX idx_concilium_members_active       ON public.concilium_members(active) WHERE active = true;

ALTER TABLE public.concilium_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own members"
  ON public.concilium_members FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all members"
  ON public.concilium_members FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 3. Concilium Member Permissions ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.concilium_member_permissions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES public.concilium_members(id) ON DELETE CASCADE,

  -- Capabilities
  can_evaluate    BOOLEAN NOT NULL DEFAULT true,
  can_recommend   BOOLEAN NOT NULL DEFAULT false,
  can_override    BOOLEAN NOT NULL DEFAULT false,

  -- Usage limits
  max_evaluations_per_day INTEGER NOT NULL DEFAULT 100,
  max_tokens_per_day      INTEGER NOT NULL DEFAULT 100000,
  max_cost_per_month_usd  NUMERIC(10,4) NOT NULL DEFAULT 50.0000,

  -- Restrictions
  forbidden_actions JSONB NOT NULL DEFAULT '[]',

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_member_permissions UNIQUE (member_id)
);

CREATE INDEX idx_member_perms_user_id   ON public.concilium_member_permissions(user_id);
CREATE INDEX idx_member_perms_member_id ON public.concilium_member_permissions(member_id);

ALTER TABLE public.concilium_member_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own member permissions"
  ON public.concilium_member_permissions FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all member permissions"
  ON public.concilium_member_permissions FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 4. Concilium Criteria ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.concilium_criteria (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concilium_id    TEXT NOT NULL REFERENCES public.concilium(id) ON DELETE CASCADE,

  -- Definition
  name            TEXT NOT NULL,
  weight          NUMERIC(3,2) NOT NULL DEFAULT 1.00
    CHECK (weight >= 0 AND weight <= 1),
  rubric          TEXT DEFAULT '',
  examples        JSONB NOT NULL DEFAULT '[]',

  -- Versioning
  version         INTEGER NOT NULL DEFAULT 1,
  is_active       BOOLEAN NOT NULL DEFAULT true,

  -- Ordering
  sort_order      INTEGER NOT NULL DEFAULT 0,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_criteria_user_id      ON public.concilium_criteria(user_id);
CREATE INDEX idx_criteria_concilium_id ON public.concilium_criteria(concilium_id);
CREATE INDEX idx_criteria_active       ON public.concilium_criteria(is_active) WHERE is_active = true;

ALTER TABLE public.concilium_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own criteria"
  ON public.concilium_criteria FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all criteria"
  ON public.concilium_criteria FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 5. Concilium Consensus Rules ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.concilium_consensus_rules (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concilium_id    TEXT NOT NULL REFERENCES public.concilium(id) ON DELETE CASCADE,

  -- Rule type
  consensus_type  TEXT NOT NULL DEFAULT 'majority'
    CHECK (consensus_type IN ('unanimous', 'majority', 'weighted', 'custom')),

  -- Thresholds
  quorum          INTEGER NOT NULL DEFAULT 2,
  approval_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  split_decision_strategy TEXT NOT NULL DEFAULT 'chairman_decides'
    CHECK (split_decision_strategy IN (
      'chairman_decides', 'reject', 'escalate_to_human', 're_evaluate'
    )),

  -- Custom rules (for consensus_type = 'custom')
  custom_rules    JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_consensus_per_board UNIQUE (concilium_id)
);

CREATE INDEX idx_consensus_user_id      ON public.concilium_consensus_rules(user_id);
CREATE INDEX idx_consensus_concilium_id ON public.concilium_consensus_rules(concilium_id);

ALTER TABLE public.concilium_consensus_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own consensus rules"
  ON public.concilium_consensus_rules FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all consensus rules"
  ON public.concilium_consensus_rules FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── 6. Concilium Action Registry ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.concilium_action_registry (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  concilium_id    TEXT NOT NULL REFERENCES public.concilium(id) ON DELETE CASCADE,

  -- Action definition
  action_name     TEXT NOT NULL,
  description     TEXT DEFAULT '',
  risk_level      TEXT NOT NULL DEFAULT 'low'
    CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

  -- Controls
  requires_approval  BOOLEAN NOT NULL DEFAULT false,
  min_approvers      INTEGER NOT NULL DEFAULT 1,
  allowed_roles      JSONB NOT NULL DEFAULT '["chairman", "evaluator"]',

  -- Status
  is_active       BOOLEAN NOT NULL DEFAULT true,

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_action_per_board UNIQUE (concilium_id, action_name)
);

CREATE INDEX idx_action_reg_user_id      ON public.concilium_action_registry(user_id);
CREATE INDEX idx_action_reg_concilium_id ON public.concilium_action_registry(concilium_id);

ALTER TABLE public.concilium_action_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own action registry"
  ON public.concilium_action_registry FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all action registry"
  ON public.concilium_action_registry FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
