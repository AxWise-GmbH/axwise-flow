-- 166: Mark a contact for an organization.
-- Adds an optional organization_id to contacts so the Assistant Console (and CRM)
-- can group / scope contacts by organization. RLS on contacts is already
-- user-scoped (auth.uid() = user_id); this column is nullable and FK-clean.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_organization_id ON public.contacts(organization_id);
