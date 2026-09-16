-- 076: Deliverables + Marketplace + Recurring Goals + Revenue + ROI
-- Phases 4-9 database foundation

-- ── Phase 4: Deliverables ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.deliverables (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL DEFAULT 'report'
    CHECK (type IN ('website', 'report', 'workflow_template', 'marketing_campaign', 'automation_script', 'api_integration', 'content_package', 'other')),
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'building', 'deployed', 'failed', 'archived')),
  url             TEXT DEFAULT NULL,
  download_url    TEXT DEFAULT NULL,
  deployment_data JSONB DEFAULT '{}'::jsonb,
  assets          JSONB DEFAULT '[]'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deliverables_goal ON public.deliverables(goal_id);
CREATE INDEX IF NOT EXISTS idx_deliverables_user ON public.deliverables(user_id);

ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own deliverables" ON public.deliverables FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role manages all deliverables" ON public.deliverables FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Phase 5: Marketplace ──────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.marketplace_listings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  creator_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           TEXT NOT NULL,
  description     TEXT DEFAULT '',
  category        TEXT DEFAULT 'general',
  deliverable_type TEXT DEFAULT 'workflow_template',
  price_usd       NUMERIC(10,2) NOT NULL DEFAULT 0,
  pricing_model   TEXT DEFAULT 'fixed'
    CHECK (pricing_model IN ('fixed', 'per_execution', 'subscription')),
  status          TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  plan_snapshot   JSONB DEFAULT '{}'::jsonb,
  tech_doc_snapshot JSONB DEFAULT '{}'::jsonb,
  success_metrics JSONB DEFAULT '{}'::jsonb,
  avg_rating      NUMERIC(3,2) DEFAULT 0,
  total_purchases INTEGER DEFAULT 0,
  total_revenue   NUMERIC(12,2) DEFAULT 0,
  tags            TEXT[] DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_marketplace_creator ON public.marketplace_listings(creator_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_status ON public.marketplace_listings(status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_marketplace_category ON public.marketplace_listings(category);

ALTER TABLE public.marketplace_listings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads active listings" ON public.marketplace_listings FOR SELECT
  USING (status = 'active' OR creator_id = auth.uid());
CREATE POLICY "Creators manage own listings" ON public.marketplace_listings FOR ALL
  USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());
CREATE POLICY "Service role manages all listings" ON public.marketplace_listings FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.marketplace_reviews (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  rating          INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  review_text     TEXT DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads reviews" ON public.marketplace_reviews FOR SELECT USING (true);
CREATE POLICY "Buyers write own reviews" ON public.marketplace_reviews FOR INSERT
  WITH CHECK (buyer_id = auth.uid());
CREATE POLICY "Service role manages all reviews" ON public.marketplace_reviews FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE TABLE IF NOT EXISTS public.marketplace_purchases (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id      UUID NOT NULL REFERENCES public.marketplace_listings(id) ON DELETE CASCADE,
  buyer_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id         UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  price_paid      NUMERIC(10,2) NOT NULL,
  creator_payout  NUMERIC(10,2) NOT NULL,
  platform_fee    NUMERIC(10,2) NOT NULL,
  payment_status  TEXT DEFAULT 'pending'
    CHECK (payment_status IN ('pending', 'paid', 'refunded', 'failed')),
  stripe_payment_id TEXT DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.marketplace_purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Buyers see own purchases" ON public.marketplace_purchases FOR SELECT
  USING (buyer_id = auth.uid());
CREATE POLICY "Creators see sales" ON public.marketplace_purchases FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.marketplace_listings l WHERE l.id = marketplace_purchases.listing_id AND l.creator_id = auth.uid()));
CREATE POLICY "Service role manages all purchases" ON public.marketplace_purchases FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Phase 6: Recurring Goals ──────────────────────────────────

ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS schedule TEXT DEFAULT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ DEFAULT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS recurring_budget_monthly NUMERIC(10,2) DEFAULT NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS run_count INTEGER DEFAULT 0;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS parent_goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL;
ALTER TABLE public.goals ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT false;

-- ── Phase 7: Revenue / Leads ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.leads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id         UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  name            TEXT NOT NULL,
  email           TEXT DEFAULT NULL,
  company         TEXT DEFAULT NULL,
  source          TEXT DEFAULT 'research',
  relevance_score NUMERIC(3,2) DEFAULT 0,
  status          TEXT DEFAULT 'new'
    CHECK (status IN ('new', 'contacted', 'interested', 'converted', 'lost')),
  approach_strategy TEXT DEFAULT '',
  contact_data    JSONB DEFAULT '{}'::jsonb,
  outreach_log    JSONB DEFAULT '[]'::jsonb,
  revenue_usd     NUMERIC(12,2) DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_user ON public.leads(user_id);
CREATE INDEX IF NOT EXISTS idx_leads_goal ON public.leads(goal_id);
CREATE INDEX IF NOT EXISTS idx_leads_status ON public.leads(status);

ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own leads" ON public.leads FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role manages all leads" ON public.leads FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- ── Phase 8: Financial Events (ROI tracking) ──────────────────

CREATE TABLE IF NOT EXISTS public.financial_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id         UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  event_type      TEXT NOT NULL
    CHECK (event_type IN ('token_spend', 'service_cost', 'ad_spend', 'marketplace_sale', 'marketplace_purchase', 'subscription_charge', 'refund', 'revenue')),
  amount_usd      NUMERIC(12,4) NOT NULL,
  direction       TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  source          TEXT DEFAULT '',
  description     TEXT DEFAULT '',
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_financial_user ON public.financial_events(user_id);
CREATE INDEX IF NOT EXISTS idx_financial_goal ON public.financial_events(goal_id);
CREATE INDEX IF NOT EXISTS idx_financial_type ON public.financial_events(event_type);
CREATE INDEX IF NOT EXISTS idx_financial_date ON public.financial_events(created_at);

ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own financial events" ON public.financial_events FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Service role manages all financial events" ON public.financial_events FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
