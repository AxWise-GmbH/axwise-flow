-- Add user_id to report_snapshots so consumers can see only their own reports
-- Wrapped in DO block because report_snapshots may not exist in all environments
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'report_snapshots') THEN
    ALTER TABLE public.report_snapshots ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
    CREATE INDEX IF NOT EXISTS idx_report_snapshots_user ON public.report_snapshots(user_id);
    DROP POLICY IF EXISTS "Authenticated read report_snapshots" ON public.report_snapshots;
    CREATE POLICY "Users read own or shared report_snapshots"
      ON public.report_snapshots FOR SELECT
      USING (auth.uid() = user_id OR user_id IS NULL);
  END IF;
END $$;
