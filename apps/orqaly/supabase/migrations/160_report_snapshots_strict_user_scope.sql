-- Tighten report_snapshots to strict per-user isolation.
--
-- Background: 011 created world-readable policies for all authenticated users.
-- 062 added user_id + a SELECT policy with a `user_id IS NULL` escape hatch, but
-- the handler never stamped user_id, so every stored payload landed NULL-owner and
-- stayed globally readable. This migration removes the escape hatch and the legacy
-- permissive policies so a user can only ever read/write their own snapshots.
--
-- report_snapshots is an ephemeral cache / audit table (45s TTL semantics), so the
-- existing NULL-owner rows are safe to discard rather than backfill.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'report_snapshots'
  ) THEN
    -- Ensure the column + index exist (idempotent; 062 may not have run everywhere).
    ALTER TABLE public.report_snapshots ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);
    CREATE INDEX IF NOT EXISTS idx_report_snapshots_user ON public.report_snapshots(user_id);

    -- Quarantine legacy world-readable rows that have no owner.
    DELETE FROM public.report_snapshots WHERE user_id IS NULL;

    -- Drop every prior permissive / escape-hatch policy by exact name.
    DROP POLICY IF EXISTS "Authenticated users can read report_snapshots" ON public.report_snapshots;
    DROP POLICY IF EXISTS "Authenticated users can manage report_snapshots" ON public.report_snapshots;
    DROP POLICY IF EXISTS "Authenticated read report_snapshots" ON public.report_snapshots;
    DROP POLICY IF EXISTS "Users read own or shared report_snapshots" ON public.report_snapshots;

    -- RLS stays enabled; recreate strict per-user policies.
    ALTER TABLE public.report_snapshots ENABLE ROW LEVEL SECURITY;

    CREATE POLICY "Users read own report_snapshots"
      ON public.report_snapshots FOR SELECT
      USING (auth.uid() = user_id);

    CREATE POLICY "Users insert own report_snapshots"
      ON public.report_snapshots FOR INSERT
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users update own report_snapshots"
      ON public.report_snapshots FOR UPDATE
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);

    CREATE POLICY "Users delete own report_snapshots"
      ON public.report_snapshots FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END $$;
