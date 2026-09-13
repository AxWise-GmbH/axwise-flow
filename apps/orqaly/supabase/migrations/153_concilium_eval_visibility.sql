-- Concilium evaluations & security events: backfill user_id and widen read RLS
-- so Analytics/Security tabs show data tied to boards the user owns.

-- Backfill evaluation owner from board
UPDATE public.concilium_evaluations e
SET user_id = c.user_id
FROM public.concilium c
WHERE e.user_id IS NULL
  AND c.user_id IS NOT NULL
  AND (e.concilium_id = c.id OR e.board_id = c.id);

-- Backfill security event owner from board
UPDATE public.concilium_security_events s
SET user_id = c.user_id
FROM public.concilium c
WHERE s.user_id IS NULL
  AND c.user_id IS NOT NULL
  AND s.board_id = c.id;

-- Evaluations: read own rows OR rows for boards you own
DROP POLICY IF EXISTS "Users read own evaluations" ON public.concilium_evaluations;

CREATE POLICY "Users read own evaluations"
  ON public.concilium_evaluations FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.concilium c
      WHERE c.user_id = auth.uid()
        AND (c.id = concilium_id OR c.id = board_id)
    )
  );

-- Security events: same pattern
DROP POLICY IF EXISTS "Users read own security events" ON public.concilium_security_events;

CREATE POLICY "Users read own security events"
  ON public.concilium_security_events FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.concilium c
      WHERE c.user_id = auth.uid()
        AND c.id = board_id
    )
  );
