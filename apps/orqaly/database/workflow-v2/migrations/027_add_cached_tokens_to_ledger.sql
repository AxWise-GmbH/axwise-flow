BEGIN;

ALTER TABLE orqaly.user_llm_usage_ledger 
ADD COLUMN IF NOT EXISTS cached_tokens integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orqaly_api') THEN
    GRANT SELECT, INSERT ON orqaly.user_llm_usage_ledger TO orqaly_api;
  END IF;
END
$$;

COMMIT;
