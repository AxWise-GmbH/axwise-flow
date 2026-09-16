-- Feature flags for Data topology visual editor
-- Allows toggling entities on/off from the Data page without deleting code

CREATE TABLE IF NOT EXISTS public.feature_flags (
  entity_id TEXT PRIMARY KEY,
  disabled BOOLEAN NOT NULL DEFAULT false,
  disabled_by UUID REFERENCES auth.users(id),
  disabled_at TIMESTAMPTZ DEFAULT now(),
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage feature flags"
  ON public.feature_flags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role_id = 'role-super-admin'
    )
  );
