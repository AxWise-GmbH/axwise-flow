-- ══════════════════════════════════════════════════════════════
-- 051: Concilium UUID Migration — Dual-key bridge for jobs + evaluations
-- Adds UUID references alongside existing TEXT ids.
-- PK swap deferred to a follow-up migration after verification.
-- ══════════════════════════════════════════════════════════════

-- ── 1. Add UUID column to jobs ──────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS concilium_uuid_id UUID;

-- Populate from concilium.uuid_id where concilium_id matches
UPDATE public.jobs j
SET concilium_uuid_id = c.uuid_id
FROM public.concilium c
WHERE j.concilium_id = c.id
  AND j.concilium_uuid_id IS NULL
  AND c.uuid_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_concilium_uuid_id
  ON public.jobs (concilium_uuid_id)
  WHERE concilium_uuid_id IS NOT NULL;

-- ── 2. Add UUID column to evaluations ───────────────────────
ALTER TABLE public.concilium_evaluations
  ADD COLUMN IF NOT EXISTS concilium_uuid_id UUID;

-- Populate from concilium.uuid_id where concilium_id matches
UPDATE public.concilium_evaluations e
SET concilium_uuid_id = c.uuid_id
FROM public.concilium c
WHERE e.concilium_id = c.id
  AND e.concilium_uuid_id IS NULL
  AND c.uuid_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_concilium_evaluations_uuid_id
  ON public.concilium_evaluations (concilium_uuid_id)
  WHERE concilium_uuid_id IS NOT NULL;

-- ── 3. Backfill function for new rows (trigger) ─────────────
CREATE OR REPLACE FUNCTION public.fn_backfill_concilium_uuid()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.concilium_id IS NOT NULL AND NEW.concilium_uuid_id IS NULL THEN
    SELECT uuid_id INTO NEW.concilium_uuid_id
    FROM public.concilium
    WHERE id = NEW.concilium_id
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

-- Jobs trigger
DROP TRIGGER IF EXISTS trg_jobs_backfill_uuid ON public.jobs;
CREATE TRIGGER trg_jobs_backfill_uuid
  BEFORE INSERT OR UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_backfill_concilium_uuid();

-- Evaluations trigger
DROP TRIGGER IF EXISTS trg_evaluations_backfill_uuid ON public.concilium_evaluations;
CREATE TRIGGER trg_evaluations_backfill_uuid
  BEFORE INSERT OR UPDATE ON public.concilium_evaluations
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_backfill_concilium_uuid();
