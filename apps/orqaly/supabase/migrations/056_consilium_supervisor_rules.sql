-- Consilium Supervisor Rules: configurable rules for automatic agent monitoring.
-- The supervisor loop checks these rules against active agents periodically.

CREATE TABLE IF NOT EXISTS public.consilium_supervisor_rules (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES auth.users NOT NULL,
  rule_name text NOT NULL,
  condition_type text NOT NULL,
  threshold jsonb NOT NULL,
  action text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE public.consilium_supervisor_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own supervisor rules"
  ON public.consilium_supervisor_rules
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_supervisor_rules_user ON public.consilium_supervisor_rules (user_id);
CREATE INDEX idx_supervisor_rules_active ON public.consilium_supervisor_rules (is_active) WHERE is_active = true;

-- Seed default rules for all existing users
INSERT INTO public.consilium_supervisor_rules (user_id, rule_name, condition_type, threshold, action)
SELECT u.id, 'Cost breach - pause', 'cost_breach', '{"max_cost_day_usd": 10}'::jsonb, 'pause'
FROM auth.users u
ON CONFLICT DO NOTHING;

INSERT INTO public.consilium_supervisor_rules (user_id, rule_name, condition_type, threshold, action)
SELECT u.id, 'High failure rate - pause', 'failure_rate', '{"max_failure_rate": 0.5}'::jsonb, 'pause'
FROM auth.users u
ON CONFLICT DO NOTHING;

INSERT INTO public.consilium_supervisor_rules (user_id, rule_name, condition_type, threshold, action)
SELECT u.id, 'Missed check-ins - pause', 'timeout', '{"max_missed_checkins": 3}'::jsonb, 'pause'
FROM auth.users u
ON CONFLICT DO NOTHING;

INSERT INTO public.consilium_supervisor_rules (user_id, rule_name, condition_type, threshold, action)
SELECT u.id, 'Security violation - terminate', 'security', '{"severity": "high"}'::jsonb, 'terminate'
FROM auth.users u
ON CONFLICT DO NOTHING;
