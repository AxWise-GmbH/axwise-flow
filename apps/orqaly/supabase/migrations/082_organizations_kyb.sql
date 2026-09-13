-- 082_organizations_kyb.sql
-- KYB (Know Your Business) fields for organizations — Basic + Full detail levels

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS kyb_level TEXT DEFAULT 'basic',           -- basic | full
  ADD COLUMN IF NOT EXISTS legal_name TEXT,                          -- official registered name
  ADD COLUMN IF NOT EXISTS registration_number TEXT,                 -- company reg / incorporation #
  ADD COLUMN IF NOT EXISTS country TEXT,                             -- country of incorporation
  ADD COLUMN IF NOT EXISTS legal_form TEXT,                          -- LLC, Corp, Ltd, GmbH, etc.
  ADD COLUMN IF NOT EXISTS contact_email TEXT,
  ADD COLUMN IF NOT EXISTS contact_phone TEXT,
  -- Full KYB fields
  ADD COLUMN IF NOT EXISTS tax_id TEXT,                              -- VAT / EIN / TIN
  ADD COLUMN IF NOT EXISTS incorporation_date DATE,
  ADD COLUMN IF NOT EXISTS registered_address JSONB DEFAULT '{}',   -- {street, city, state, zip, country}
  ADD COLUMN IF NOT EXISTS directors JSONB DEFAULT '[]',            -- [{name, role, nationality, dob}]
  ADD COLUMN IF NOT EXISTS ubos JSONB DEFAULT '[]',                 -- ultimate beneficial owners [{name, ownership_pct, nationality}]
  ADD COLUMN IF NOT EXISTS bank_details JSONB DEFAULT '{}',         -- {bank_name, iban, swift, account_holder}
  ADD COLUMN IF NOT EXISTS industry_codes JSONB DEFAULT '{}',       -- {sic, naics, nace}
  ADD COLUMN IF NOT EXISTS kyb_status TEXT DEFAULT 'draft',         -- draft | pending | verified | rejected
  ADD COLUMN IF NOT EXISTS kyb_notes TEXT;
