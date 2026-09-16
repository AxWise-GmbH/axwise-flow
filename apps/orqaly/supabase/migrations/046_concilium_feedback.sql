-- Concilium feedback: outcome tracking for evaluations
-- Phase 3: Evaluation Engine v2 — was the board correct?

CREATE TABLE IF NOT EXISTS public.concilium_feedback (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  evaluation_id   UUID NOT NULL REFERENCES public.concilium_evaluations(id) ON DELETE CASCADE,
  board_id        TEXT,

  -- Outcome assessment
  was_board_correct   BOOLEAN,
  false_positive      BOOLEAN DEFAULT false,
  false_negative      BOOLEAN DEFAULT false,
  user_notes          TEXT DEFAULT '',

  -- Rating (1-5 stars)
  quality_rating      INTEGER CHECK (quality_rating IS NULL OR (quality_rating >= 1 AND quality_rating <= 5)),

  -- Metadata
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT unique_feedback_per_eval UNIQUE (evaluation_id)
);

CREATE INDEX idx_feedback_user_id       ON public.concilium_feedback(user_id);
CREATE INDEX idx_feedback_evaluation_id ON public.concilium_feedback(evaluation_id);
CREATE INDEX idx_feedback_board_id      ON public.concilium_feedback(board_id);
CREATE INDEX idx_feedback_correct       ON public.concilium_feedback(was_board_correct)
  WHERE was_board_correct IS NOT NULL;

ALTER TABLE public.concilium_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own feedback"
  ON public.concilium_feedback FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages all feedback"
  ON public.concilium_feedback FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
