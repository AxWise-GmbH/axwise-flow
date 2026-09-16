-- 091: Communicator v2 — command_history table + performance indexes
-- New table for controller command tracking
CREATE TABLE IF NOT EXISTS public.command_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  input        TEXT NOT NULL,
  parsed_intent TEXT DEFAULT '',
  output       TEXT DEFAULT '',
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('success','error','pending')),
  channel_id   UUID REFERENCES public.communication_channels(id) ON DELETE SET NULL,
  platform     TEXT DEFAULT 'internal',
  metadata     JSONB NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.command_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own commands" ON public.command_history FOR ALL
  USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_cmd_history_user ON public.command_history(user_id, created_at DESC);

-- Performance indexes on existing tables
CREATE INDEX IF NOT EXISTS idx_goal_messages_goal ON public.goal_messages(goal_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_eval_board ON public.concilium_evaluations(concilium_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_eval_approved ON public.concilium_evaluations(approved);
