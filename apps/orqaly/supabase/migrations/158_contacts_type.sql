-- 158: Add contact_type column to contacts

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS contact_type TEXT DEFAULT 'phone' CHECK (contact_type IN ('phone', 'mail'));

-- Index on contact_type for fast filtering
CREATE INDEX IF NOT EXISTS idx_contacts_contact_type ON public.contacts(contact_type);
