-- Concilium evaluations v2: extend evaluations for multi-member evaluation
-- Phase 3: Evaluation Engine v2

-- Add new columns to existing concilium_evaluations table
ALTER TABLE public.concilium_evaluations
  ADD COLUMN IF NOT EXISTS board_id          TEXT,
  ADD COLUMN IF NOT EXISTS agent_id          TEXT,
  ADD COLUMN IF NOT EXISTS member_responses  JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS decision_level    TEXT DEFAULT 'LOW'
    CHECK (decision_level IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  ADD COLUMN IF NOT EXISTS consensus_type    TEXT,
  ADD COLUMN IF NOT EXISTS human_review_required BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS human_review_status   TEXT DEFAULT 'not_required'
    CHECK (human_review_status IN ('not_required', 'pending', 'approved', 'rejected', 'overridden')),
  ADD COLUMN IF NOT EXISTS total_cost_usd    NUMERIC(10,4) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS total_tokens      INTEGER DEFAULT 0;

-- Backfill board_id from concilium_id for existing rows
UPDATE public.concilium_evaluations
SET board_id = concilium_id
WHERE board_id IS NULL AND concilium_id IS NOT NULL;

-- Indexes for new columns
CREATE INDEX IF NOT EXISTS idx_eval_board_id ON public.concilium_evaluations(board_id);
CREATE INDEX IF NOT EXISTS idx_eval_decision_level ON public.concilium_evaluations(decision_level);
CREATE INDEX IF NOT EXISTS idx_eval_human_review ON public.concilium_evaluations(human_review_required)
  WHERE human_review_required = true AND human_review_status = 'pending';
