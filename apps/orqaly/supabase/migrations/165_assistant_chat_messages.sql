-- Persistent history for the Personal Assistant chat (assistant <-> user).
-- Until now the conversation lived only in React state and was lost on reload.
-- Written by lib/api-handlers/assistant-history.js (op=log) and read back
-- (op=list) for the Communicator -> Personal Assistant -> History section.
-- Run in the Supabase SQL Editor. Additive + idempotent.

CREATE TABLE IF NOT EXISTS public.assistant_chat_messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Groups messages into a single conversation/session (client-generated uuid).
  conversation_id UUID NOT NULL,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content         TEXT NOT NULL DEFAULT '',
  -- Assistant mode/category at send time (assistant | talk | consilium | team).
  mode            TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_asst_chat_user_created
  ON public.assistant_chat_messages (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_asst_chat_convo
  ON public.assistant_chat_messages (conversation_id, created_at);

ALTER TABLE public.assistant_chat_messages ENABLE ROW LEVEL SECURITY;

-- User owns their own messages.
DROP POLICY IF EXISTS assistant_chat_messages_owner ON public.assistant_chat_messages;
CREATE POLICY assistant_chat_messages_owner ON public.assistant_chat_messages
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Backend workers (service role) bypass RLS.
DROP POLICY IF EXISTS assistant_chat_messages_service ON public.assistant_chat_messages;
CREATE POLICY assistant_chat_messages_service ON public.assistant_chat_messages
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
