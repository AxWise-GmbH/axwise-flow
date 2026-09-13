-- Pipeline Wiring: Add columns for automated request-to-report pipeline.
-- Jobs: approval tracking, cost aggregation, report link, request origin.
-- Team tasks: waterfall ordering.

-- ── Jobs table enhancements ──────────────────────────────────────
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS approval_status text DEFAULT NULL
    CHECK (approval_status IS NULL OR approval_status IN ('pending_approval', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS report_id uuid DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS cost_usd numeric(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_request_id text DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_source_request_id
  ON public.jobs(source_request_id) WHERE source_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_approval_status
  ON public.jobs(approval_status) WHERE approval_status IS NOT NULL;

-- ── Team tasks: waterfall ordering ───────────────────────────────
ALTER TABLE public.team_tasks
  ADD COLUMN IF NOT EXISTS sequence_order integer DEFAULT 0;
