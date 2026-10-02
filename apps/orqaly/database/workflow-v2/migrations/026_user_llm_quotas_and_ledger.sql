BEGIN;

CREATE TABLE IF NOT EXISTS orqaly.user_llm_quotas (
  user_id text PRIMARY KEY,
  plan_tier text NOT NULL DEFAULT 'free',
  monthly_limit_cents integer NOT NULL DEFAULT 500,
  is_blocked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS orqaly.user_llm_usage_ledger (
  id bigserial PRIMARY KEY,
  user_id text NOT NULL,
  model text NOT NULL,
  prompt_tokens integer NOT NULL DEFAULT 0,
  completion_tokens integer NOT NULL DEFAULT 0,
  total_tokens integer NOT NULL DEFAULT 0,
  estimated_cost_cents numeric(10, 4) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX IF NOT EXISTS idx_user_llm_usage_monthly 
ON orqaly.user_llm_usage_ledger (user_id, created_at);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orqaly_api') THEN
    GRANT SELECT, INSERT, UPDATE ON orqaly.user_llm_quotas TO orqaly_api;
    GRANT SELECT, INSERT ON orqaly.user_llm_usage_ledger TO orqaly_api;
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA orqaly TO orqaly_api;
  END IF;
END
$$;

COMMIT;
