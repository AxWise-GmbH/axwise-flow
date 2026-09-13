-- 167: Scope knowledge base documents to an Organization + Consilium.
-- Adds two optional columns so a KB document can be assigned to a specific
-- organization and consilium (AI board). RLS on knowledge_documents stays
-- user-scoped (auth.uid() = user_id); both columns are nullable so all
-- existing documents remain unassigned.
--
-- organization_id -> organizations(id) (UUID, FK, set null on org delete).
-- concilium_id    -> plain TEXT matching concilium.id / organizations.consilium_id
--                    (no FK, mirrors the existing org->board link and avoids
--                     coupling a document to board deletion).

ALTER TABLE public.knowledge_documents
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS concilium_id TEXT;

CREATE INDEX IF NOT EXISTS idx_knowledge_documents_organization_id ON public.knowledge_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_documents_concilium_id    ON public.knowledge_documents(concilium_id);
