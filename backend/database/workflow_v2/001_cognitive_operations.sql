BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS axwise;

CREATE TABLE axwise.cognitive_operations (
  operation_id uuid PRIMARY KEY,
  operation_type text NOT NULL CHECK (operation_type IN (
    'CompileScopeV2', 'ReviseScopeV2', 'ExecuteResearchV2', 'SynthesizeArtifactV1'
  )),
  canonical_input_hash text NOT NULL CHECK (canonical_input_hash ~ '^[a-f0-9]{64}$'),
  contract_version text NOT NULL CHECK (contract_version = 'axwise.operation.v2'),
  tenant_id uuid NOT NULL,
  organization_id text NULL CHECK (
    organization_id IS NULL OR organization_id ~ '^org_[A-Za-z0-9]+$'
  ),
  user_id text NOT NULL CHECK (user_id ~ '^user_[A-Za-z0-9]+$'),
  run_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  stage_attempt_id uuid NOT NULL,
  input_payload jsonb NOT NULL CHECK (jsonb_typeof(input_payload) = 'object'),
  status text NOT NULL DEFAULT 'accepted' CHECK (
    status IN ('accepted', 'running', 'completed', 'failed')
  ),
  result_payload jsonb NULL CHECK (
    result_payload IS NULL OR jsonb_typeof(result_payload) = 'object'
  ),
  retryable boolean NULL,
  error_class text NULL,
  lease_token uuid NULL,
  lease_expires_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz NULL,
  CHECK (
    (lease_token IS NULL AND lease_expires_at IS NULL) OR
    (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CHECK (
    (status = 'completed' AND result_payload IS NOT NULL AND retryable IS NULL AND error_class IS NULL) OR
    (status = 'failed' AND result_payload IS NULL AND retryable IS NOT NULL AND error_class IS NOT NULL) OR
    (status IN ('accepted', 'running') AND result_payload IS NULL AND retryable IS NULL AND error_class IS NULL)
  )
);

CREATE INDEX cognitive_operations_owner_idx
  ON axwise.cognitive_operations (tenant_id, run_id, stage_id, stage_attempt_id);
CREATE INDEX cognitive_operations_recovery_idx
  ON axwise.cognitive_operations (lease_expires_at)
  WHERE status = 'running';

CREATE OR REPLACE FUNCTION axwise.protect_cognitive_operation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'cognitive operation cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF OLD.operation_id <> NEW.operation_id
    OR OLD.operation_type <> NEW.operation_type
    OR OLD.canonical_input_hash <> NEW.canonical_input_hash
    OR OLD.contract_version <> NEW.contract_version
    OR OLD.tenant_id <> NEW.tenant_id
    OR OLD.organization_id IS DISTINCT FROM NEW.organization_id
    OR OLD.user_id <> NEW.user_id
    OR OLD.run_id <> NEW.run_id
    OR OLD.stage_id <> NEW.stage_id
    OR OLD.stage_attempt_id <> NEW.stage_attempt_id
    OR OLD.input_payload <> NEW.input_payload THEN
    RAISE EXCEPTION 'cognitive operation identity and input are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'terminal cognitive operation is immutable' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE TRIGGER cognitive_operations_protect
BEFORE UPDATE OR DELETE ON axwise.cognitive_operations
FOR EACH ROW EXECUTE FUNCTION axwise.protect_cognitive_operation();

REVOKE ALL ON SCHEMA axwise FROM PUBLIC;
REVOKE ALL ON axwise.cognitive_operations FROM PUBLIC;

COMMIT;
