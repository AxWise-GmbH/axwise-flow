-- 088: deal_documents — VC-standard document attachments for investment deals
CREATE TABLE IF NOT EXISTS public.deal_documents (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  deal_id             UUID NOT NULL REFERENCES public.investment_deals(id) ON DELETE CASCADE,
  category            TEXT NOT NULL DEFAULT 'other'
                      CHECK (category IN ('pitch_deck','business_plan','financial_model','term_sheet','executive_summary','due_diligence','other')),
  name                TEXT NOT NULL,
  storage_path        TEXT NOT NULL,
  file_size           INTEGER,
  mime_type           TEXT,
  uploaded_by_agent_id UUID DEFAULT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_deal_documents_deal ON public.deal_documents(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_documents_user ON public.deal_documents(user_id);

ALTER TABLE public.deal_documents ENABLE ROW LEVEL SECURITY;

-- Owner can do everything
CREATE POLICY deal_documents_owner ON public.deal_documents
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Any authenticated user can read documents (needed for deal detail page viewers)
CREATE POLICY deal_documents_read ON public.deal_documents
  FOR SELECT TO authenticated
  USING (true);

-- Service role bypass
CREATE POLICY deal_documents_service ON public.deal_documents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
