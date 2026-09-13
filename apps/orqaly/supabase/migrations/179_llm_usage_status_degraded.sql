-- 179_llm_usage_status_degraded.sql
-- Allow status='degraded' on llm_usage.
--
-- The original inline CHECK (migration 159) permitted only ('ok','error','timeout'),
-- so AxWise "degraded" telemetry rows (written by lib/integrations/axwise/tracked.js)
-- violated the constraint and were silently dropped - the reliability signal the
-- AxWise health view needs never landed. This relaxes the CHECK to include 'degraded'.
--
-- Idempotent: drops whatever the current status CHECK is (resolved by definition, since
-- migration 159 created it inline with an auto-generated name) and installs a named,
-- relaxed one. RLS unchanged (no new columns/policies).

DO $$
DECLARE
  cname text;
BEGIN
  -- Drop the existing status CHECK constraint (by definition, to survive the
  -- auto-generated name from the inline ADD COLUMN ... CHECK in migration 159).
  FOR cname IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'llm_usage'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%'
      AND pg_get_constraintdef(con.oid) ILIKE '%timeout%'
  LOOP
    EXECUTE format('ALTER TABLE public.llm_usage DROP CONSTRAINT %I', cname);
  END LOOP;

  -- Install the relaxed constraint if not already present.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE nsp.nspname = 'public'
      AND rel.relname = 'llm_usage'
      AND con.conname = 'llm_usage_status_check'
  ) THEN
    ALTER TABLE public.llm_usage
      ADD CONSTRAINT llm_usage_status_check
      CHECK (status IN ('ok', 'error', 'timeout', 'degraded'));
  END IF;
END $$;
