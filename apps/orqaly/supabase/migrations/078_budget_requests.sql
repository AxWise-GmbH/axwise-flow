-- 078: Budget requests + Payment methods
-- Budget requests: agents request operational funds during goal execution
-- Payment methods: card storage via Stripe

-- Budget Requests
CREATE TABLE IF NOT EXISTS public.budget_requests (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  goal_id        UUID NOT NULL,
  task_id        TEXT DEFAULT NULL,
  agent_name     TEXT DEFAULT '',
  amount_usd     NUMERIC(12,2) NOT NULL CHECK (amount_usd > 0),
  purpose        TEXT NOT NULL DEFAULT '',
  category       TEXT NOT NULL DEFAULT 'operational'
    CHECK (category IN ('ad_spend','service_cost','tool_license','infrastructure','operational','other')),
  status         TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  reviewed_at    TIMESTAMPTZ DEFAULT NULL,
  reviewer_notes TEXT DEFAULT '',
  metadata       JSONB DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_budget_requests_goal ON public.budget_requests(goal_id);
CREATE INDEX IF NOT EXISTS idx_budget_requests_user ON public.budget_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_budget_requests_pending ON public.budget_requests(user_id) WHERE status = 'pending';

ALTER TABLE public.budget_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY budget_requests_user_select ON public.budget_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY budget_requests_user_insert ON public.budget_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY budget_requests_user_update ON public.budget_requests FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY budget_requests_service ON public.budget_requests FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Payment Methods
CREATE TABLE IF NOT EXISTS public.payment_methods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('card','crypto_wallet')),
  label          TEXT DEFAULT '',
  card_brand     TEXT DEFAULT NULL,
  card_last4     TEXT DEFAULT NULL,
  card_exp       TEXT DEFAULT NULL,
  stripe_pm_id   TEXT DEFAULT NULL,
  wallet_address TEXT DEFAULT NULL,
  wallet_network TEXT DEFAULT NULL,
  is_default     BOOLEAN DEFAULT false,
  status         TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON public.payment_methods(user_id);

ALTER TABLE public.payment_methods ENABLE ROW LEVEL SECURITY;

CREATE POLICY payment_methods_user_select ON public.payment_methods FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY payment_methods_user_insert ON public.payment_methods FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY payment_methods_user_update ON public.payment_methods FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY payment_methods_user_delete ON public.payment_methods FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY payment_methods_service ON public.payment_methods FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Enable realtime for budget_requests
ALTER PUBLICATION supabase_realtime ADD TABLE public.budget_requests;
