-- 075: Agent Communication Rooms — structured messaging between agents during goal execution
-- Channels: team-room (all), lead-consilium (team lead ↔ Consilium), agent-lead (agent ↔ lead)

CREATE TABLE IF NOT EXISTS public.goal_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id         UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  sender_agent_id UUID DEFAULT NULL,
  sender_name     TEXT NOT NULL DEFAULT 'system',
  recipient_agent_id UUID DEFAULT NULL,
  channel         TEXT NOT NULL DEFAULT 'team-room'
    CHECK (channel IN ('team-room', 'lead-consilium', 'agent-lead', 'system')),
  message         TEXT NOT NULL,
  message_type    TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text', 'decision', 'feedback', 'instruction', 'report', 'alert')),
  metadata        JSONB DEFAULT '{}'::jsonb,
  is_archived     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_messages_goal ON public.goal_messages(goal_id);
CREATE INDEX IF NOT EXISTS idx_goal_messages_channel ON public.goal_messages(goal_id, channel);
CREATE INDEX IF NOT EXISTS idx_goal_messages_sender ON public.goal_messages(sender_agent_id);

ALTER TABLE public.goal_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own goal messages" ON public.goal_messages FOR ALL
  USING (EXISTS (SELECT 1 FROM public.goals g WHERE g.id = goal_messages.goal_id AND g.user_id = auth.uid()));
CREATE POLICY "Service role manages all goal messages" ON public.goal_messages FOR ALL
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
