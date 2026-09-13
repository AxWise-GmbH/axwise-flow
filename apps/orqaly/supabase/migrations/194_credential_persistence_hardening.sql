-- 194: Prevent new plaintext credential persistence.
--
-- OAuth tokens are now AES-256-GCM envelope-encrypted by the application and
-- stored in Supabase Vault. integration_credentials keeps only the Vault
-- pointer and non-secret lifecycle metadata.
--
-- The constraints are NOT VALID deliberately: PostgreSQL enforces them for
-- new inserts and updates without rewriting or deleting legacy rows. Existing
-- plaintext needs a separately authorized, operator-run cleanup because SQL
-- cannot encrypt it safely: the KEK intentionally lives outside the database.

BEGIN;

-- Reusable recursive predicate for JSONB persistence boundaries. It checks key
-- names, not values, so public credential-definition objects such as
-- {"key":"TAVILY_API_KEY","label":"..."} remain valid while a field named
-- TAVILY_API_KEY or nested smsService.apiSecret is rejected.
CREATE OR REPLACE FUNCTION public.jsonb_contains_plaintext_credential(input_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  entry record;
  normalized_key text;
BEGIN
  IF pg_catalog.jsonb_typeof(input_value) = 'object' THEN
    FOR entry IN SELECT key, value FROM pg_catalog.jsonb_each(input_value)
    LOOP
      normalized_key := pg_catalog.regexp_replace(pg_catalog.lower(entry.key), '[_-]', '', 'g');
      IF normalized_key IN ('secret', 'token')
         OR normalized_key ~ '(apikey|apisecret|webhooksecret|signingsecret|clientsecret|secretkey|bearertoken|bottoken|secrettoken|accesstoken|refreshtoken)$' THEN
        RETURN true;
      END IF;
      IF pg_catalog.jsonb_typeof(entry.value) IN ('object', 'array')
         AND public.jsonb_contains_plaintext_credential(entry.value) THEN
        RETURN true;
      END IF;
    END LOOP;
  ELSIF pg_catalog.jsonb_typeof(input_value) = 'array' THEN
    FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(input_value)
    LOOP
      IF pg_catalog.jsonb_typeof(entry.value) IN ('object', 'array')
         AND public.jsonb_contains_plaintext_credential(entry.value) THEN
        RETURN true;
      END IF;
    END LOOP;
  END IF;
  RETURN false;
END;
$$;

ALTER TABLE public.integration_credentials
  ADD COLUMN IF NOT EXISTS vault_secret_id uuid,
  ADD COLUMN IF NOT EXISTS credential_kek_id text,
  ADD COLUMN IF NOT EXISTS credential_algorithm text,
  ADD COLUMN IF NOT EXISTS credential_version integer;

COMMENT ON COLUMN public.integration_credentials.vault_secret_id IS
  'Pointer to a Vault secret containing an application envelope; never an OAuth token.';
COMMENT ON COLUMN public.integration_credentials.credential_kek_id IS
  'Non-secret identifier of the KEK used by the application envelope.';

ALTER TABLE public.integration_credentials
  DROP CONSTRAINT IF EXISTS integration_credentials_no_plaintext_tokens,
  DROP CONSTRAINT IF EXISTS integration_credentials_active_vault_pointer,
  DROP CONSTRAINT IF EXISTS integration_credentials_no_token_metadata;

ALTER TABLE public.integration_credentials
  ADD CONSTRAINT integration_credentials_no_plaintext_tokens
    CHECK (access_token IS NULL AND refresh_token IS NULL) NOT VALID,
  ADD CONSTRAINT integration_credentials_active_vault_pointer
    CHECK (status <> 'active' OR vault_secret_id IS NOT NULL) NOT VALID,
  ADD CONSTRAINT integration_credentials_no_token_metadata
    CHECK (
      NOT public.jsonb_contains_plaintext_credential(metadata)
      AND NOT (metadata ?| ARRAY['tokens', 'creds'])
    ) NOT VALID;

-- tools.data remains a public, non-secret configuration document. These
-- audited credential fields are rejected on every new insert or update while
-- preserving unrelated URL/method/header/config fields.
ALTER TABLE public.tools
  DROP CONSTRAINT IF EXISTS tools_data_no_plaintext_credentials;
ALTER TABLE public.tools
  ADD CONSTRAINT tools_data_no_plaintext_credentials
  CHECK (NOT public.jsonb_contains_plaintext_credential(data)) NOT VALID;

-- Workflow delivery credentials were also accepted by a browser-only editor.
-- Block new persistence at the database boundary; existing rows require the
-- same explicit cleanup/backfill operation described above.
ALTER TABLE public.workflows
  DROP CONSTRAINT IF EXISTS workflows_data_no_plaintext_credentials;
ALTER TABLE public.workflows
  ADD CONSTRAINT workflows_data_no_plaintext_credentials
  CHECK (NOT public.jsonb_contains_plaintext_credential(data)) NOT VALID;

COMMIT;
