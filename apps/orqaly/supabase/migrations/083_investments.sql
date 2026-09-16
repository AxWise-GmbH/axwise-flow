-- 083_investments.sql
-- Investment ecosystem — deals, investors, pools, commitments, transactions, analytics

-- ── Investor profiles (human + AI) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS investment_investors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id            TEXT,                                    -- non-null for AI investors
  investor_type       TEXT NOT NULL DEFAULT 'human',           -- human | ai
  name                TEXT NOT NULL,
  bio                 TEXT,
  investment_capacity NUMERIC(12,2) DEFAULT 0,                 -- max they can invest
  total_invested      NUMERIC(12,2) DEFAULT 0,
  total_returns       NUMERIC(12,2) DEFAULT 0,
  trust_score         NUMERIC(4,2) DEFAULT 50,                 -- 0-100
  risk_profile        TEXT DEFAULT 'moderate',                  -- conservative | moderate | aggressive
  preferred_industries TEXT[] DEFAULT '{}',
  ai_criteria         JSONB DEFAULT '{}',                       -- auto-invest rules for AI
  is_active           BOOLEAN DEFAULT true,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_investors_user ON investment_investors (user_id);
ALTER TABLE investment_investors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "investors_select" ON investment_investors FOR SELECT TO authenticated USING (true);
CREATE POLICY "investors_manage" ON investment_investors FOR ALL USING (user_id = auth.uid());

-- ── Deals posted by team leads / agents ─────────────────────────────
CREATE TABLE IF NOT EXISTS investment_deals (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_by_agent_id TEXT,
  title               TEXT NOT NULL,
  description         TEXT,
  industry            TEXT,
  tags                TEXT[] DEFAULT '{}',
  required_amount     NUMERIC(12,2) NOT NULL,
  current_funded      NUMERIC(12,2) DEFAULT 0,
  funding_pct         NUMERIC(5,2) DEFAULT 0,
  min_investment      NUMERIC(12,2) DEFAULT 1,
  roi_projections     JSONB DEFAULT '{}',                       -- { optimistic, expected, pessimistic }
  revenue_share_terms JSONB DEFAULT '{}',                       -- { share_pct, distribution_frequency, vesting }
  strategy_plan       JSONB DEFAULT '{}',
  risk_level          TEXT DEFAULT 'medium',                    -- low | medium | high | critical
  status              TEXT DEFAULT 'draft',                     -- draft, pending_review, seeking_funding, funded, active, distributing_returns, completed, failed, cancelled
  consilium_evaluation JSONB DEFAULT '{}',
  goal_id             UUID,                                    -- link to goal system
  deadline            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deals_user ON investment_deals (user_id);
CREATE INDEX IF NOT EXISTS idx_deals_status ON investment_deals (status);
ALTER TABLE investment_deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deals_select" ON investment_deals FOR SELECT TO authenticated USING (true);
CREATE POLICY "deals_manage" ON investment_deals FOR ALL USING (user_id = auth.uid());

-- ── Commitments (investor → deal) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS investment_commitments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id             UUID NOT NULL REFERENCES investment_deals(id) ON DELETE CASCADE,
  investor_id         UUID NOT NULL REFERENCES investment_investors(id) ON DELETE CASCADE,
  pool_id             UUID,                                    -- FK added after pools table
  amount              NUMERIC(12,2) NOT NULL,
  commitment_type     TEXT DEFAULT 'direct',                   -- direct | pooled
  status              TEXT DEFAULT 'active',                   -- active | withdrawn | returned
  returns_received    NUMERIC(12,2) DEFAULT 0,
  committed_at        TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commitments_deal ON investment_commitments (deal_id);
CREATE INDEX IF NOT EXISTS idx_commitments_investor ON investment_commitments (investor_id);
ALTER TABLE investment_commitments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "commitments_select" ON investment_commitments FOR SELECT TO authenticated USING (true);
CREATE POLICY "commitments_manage" ON investment_commitments FOR ALL USING (user_id = auth.uid());

-- ── Pools (collective investing) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS investment_pools (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name                TEXT NOT NULL,
  description         TEXT,
  target_amount       NUMERIC(12,2) NOT NULL,
  current_amount      NUMERIC(12,2) DEFAULT 0,
  min_contribution    NUMERIC(12,2) DEFAULT 1,
  max_contribution    NUMERIC(12,2),
  target_deal_id      UUID REFERENCES investment_deals(id) ON DELETE SET NULL,
  terms               JSONB DEFAULT '{}',
  tier_benefits       JSONB DEFAULT '[]',                       -- [{ min_amount, bonus_roi_pct }]
  status              TEXT DEFAULT 'forming',                  -- forming | active | invested | distributing | closed
  auto_invest         BOOLEAN DEFAULT false,
  deadline            TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE investment_commitments ADD CONSTRAINT fk_commitment_pool
  FOREIGN KEY (pool_id) REFERENCES investment_pools(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pools_user ON investment_pools (user_id);
ALTER TABLE investment_pools ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pools_select" ON investment_pools FOR SELECT TO authenticated USING (true);
CREATE POLICY "pools_manage" ON investment_pools FOR ALL USING (user_id = auth.uid());

-- ── Pool members ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS investment_pool_members (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pool_id             UUID NOT NULL REFERENCES investment_pools(id) ON DELETE CASCADE,
  investor_id         UUID NOT NULL REFERENCES investment_investors(id) ON DELETE CASCADE,
  contributed_amount  NUMERIC(12,2) NOT NULL,
  share_pct           NUMERIC(6,3) DEFAULT 0,
  joined_at           TIMESTAMPTZ DEFAULT now(),
  UNIQUE(pool_id, investor_id)
);

CREATE INDEX IF NOT EXISTS idx_pool_members_pool ON investment_pool_members (pool_id);
ALTER TABLE investment_pool_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pool_members_select" ON investment_pool_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "pool_members_manage" ON investment_pool_members FOR ALL USING (user_id = auth.uid());

-- ── Transactions (financial event log) ──────────────────────────────
CREATE TABLE IF NOT EXISTS investment_transactions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id             UUID REFERENCES investment_deals(id) ON DELETE SET NULL,
  pool_id             UUID REFERENCES investment_pools(id) ON DELETE SET NULL,
  investor_id         UUID REFERENCES investment_investors(id) ON DELETE SET NULL,
  transaction_type    TEXT NOT NULL,                            -- invest, withdraw, return, fee, bonus, pool_contribution, pool_distribution
  amount              NUMERIC(12,2) NOT NULL,
  balance_after       NUMERIC(12,2),
  description         TEXT,
  metadata            JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_transactions_deal ON investment_transactions (deal_id);
CREATE INDEX IF NOT EXISTS idx_transactions_investor ON investment_transactions (investor_id);
ALTER TABLE investment_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "transactions_select" ON investment_transactions FOR SELECT TO authenticated USING (true);
CREATE POLICY "transactions_manage" ON investment_transactions FOR ALL USING (user_id = auth.uid());

-- ── Deal Analytics (poster reputation, ROI history, industry stats) ─
CREATE TABLE IF NOT EXISTS investment_deal_analytics (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             UUID NOT NULL REFERENCES investment_deals(id) ON DELETE CASCADE,
  poster_id           UUID REFERENCES auth.users(id),
  poster_agent_id     TEXT,
  -- Deal performance
  actual_roi_pct      NUMERIC(8,3),
  actual_revshare_pct NUMERIC(8,3),
  total_distributed   NUMERIC(12,2) DEFAULT 0,
  total_invested      NUMERIC(12,2) DEFAULT 0,
  investor_count      INTEGER DEFAULT 0,
  pool_count          INTEGER DEFAULT 0,
  -- Poster reputation
  poster_total_deals  INTEGER DEFAULT 0,
  poster_successful   INTEGER DEFAULT 0,
  poster_failed       INTEGER DEFAULT 0,
  poster_avg_roi_pct  NUMERIC(8,3) DEFAULT 0,
  poster_trust_score  NUMERIC(4,2) DEFAULT 50,
  -- Industry context
  industry            TEXT,
  industry_avg_roi    NUMERIC(8,3),
  industry_deal_count INTEGER DEFAULT 0,
  -- Timeline
  funding_duration_hrs INTEGER,                                -- hours from seeking_funding to funded
  execution_duration_days INTEGER,                             -- days from funded to distributing
  -- Money flow snapshot
  money_in            NUMERIC(12,2) DEFAULT 0,                 -- total capital received
  money_out           NUMERIC(12,2) DEFAULT 0,                 -- total distributions + fees
  net_return          NUMERIC(12,2) DEFAULT 0,
  -- Status
  computed_at         TIMESTAMPTZ DEFAULT now(),
  UNIQUE(deal_id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_poster ON investment_deal_analytics (poster_id);
CREATE INDEX IF NOT EXISTS idx_analytics_industry ON investment_deal_analytics (industry);
ALTER TABLE investment_deal_analytics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "analytics_select" ON investment_deal_analytics FOR SELECT TO authenticated USING (true);
CREATE POLICY "analytics_manage" ON investment_deal_analytics FOR ALL USING (poster_id = auth.uid());

-- ── Realtime ────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE investment_deals;
ALTER PUBLICATION supabase_realtime ADD TABLE investment_commitments;
ALTER PUBLICATION supabase_realtime ADD TABLE investment_pools;
ALTER PUBLICATION supabase_realtime ADD TABLE investment_pool_members;
