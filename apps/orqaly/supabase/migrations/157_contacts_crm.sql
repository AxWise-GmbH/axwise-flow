-- 157: Contacts CRM Schema

CREATE TABLE IF NOT EXISTS public.contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  phone           TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  attitude        TEXT DEFAULT 'neutral' CHECK (attitude IN ('vip', 'friendly', 'neutral', 'cold_lead', 'hostile')),
  comment         TEXT DEFAULT '',
  goal_id         UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- Create user-specific policies
CREATE POLICY "contacts_select" ON public.contacts
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "contacts_insert" ON public.contacts
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_update" ON public.contacts
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "contacts_delete" ON public.contacts
  FOR DELETE USING (auth.uid() = user_id);

-- Performance Indexes
CREATE INDEX IF NOT EXISTS idx_contacts_user_id ON public.contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_goal_id ON public.contacts(goal_id);
