-- App-wide settings key-value store.
-- Used for configurable settings like access PIN (hashed).
CREATE TABLE IF NOT EXISTS public.app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '',
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read (needed for verify-pin to check DB)
CREATE POLICY "Authenticated users can read app_settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

-- Only super admin can insert/update
CREATE POLICY "Super admin can manage app_settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_id = 'role-super-admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_roles.user_id = auth.uid()
        AND user_roles.role_id = 'role-super-admin'
    )
  );
