BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS axwise;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axwise_v2_owner') THEN
    CREATE ROLE axwise_v2_owner NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axwise_v2_api') THEN
    CREATE ROLE axwise_v2_api NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'axwise_v2_worker') THEN
    CREATE ROLE axwise_v2_worker NOLOGIN;
  END IF;
END
$$;

-- Cloud SQL's built-in postgres account is an administrative role, not a true
-- PostgreSQL superuser. PostgreSQL 16 therefore requires an explicit SET-role
-- membership and CREATE on the containing schema while SECURITY DEFINER
-- ownership is transferred. The enclosing transaction makes both temporary
-- grants rollback-safe.
GRANT axwise_v2_owner TO CURRENT_USER;
GRANT CREATE ON SCHEMA axwise TO axwise_v2_owner;

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
  error_class text NULL CHECK (
    error_class IS NULL OR length(error_class) BETWEEN 1 AND 200
  ),
  lease_token uuid NULL,
  lease_expires_at timestamptz NULL,
  execution_count integer NOT NULL DEFAULT 0 CHECK (execution_count >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  started_at timestamptz NULL,
  last_heartbeat_at timestamptz NULL,
  completed_at timestamptz NULL,
  UNIQUE (tenant_id, stage_attempt_id, operation_type),
  CHECK (
    (status = 'accepted' AND lease_token IS NULL AND lease_expires_at IS NULL
      AND result_payload IS NULL AND retryable IS NULL AND error_class IS NULL) OR
    (status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL
      AND result_payload IS NULL AND retryable IS NULL AND error_class IS NULL) OR
    (status = 'completed' AND lease_token IS NULL AND lease_expires_at IS NULL
      AND result_payload IS NOT NULL AND retryable IS NULL AND error_class IS NULL) OR
    (status = 'failed' AND lease_token IS NULL AND lease_expires_at IS NULL
      AND result_payload IS NULL AND retryable IS NOT NULL AND error_class IS NOT NULL)
  )
);

CREATE INDEX cognitive_operations_owner_idx
  ON axwise.cognitive_operations (tenant_id, run_id, stage_id, stage_attempt_id);
CREATE INDEX cognitive_operations_recovery_idx
  ON axwise.cognitive_operations (created_at, lease_expires_at)
  WHERE status IN ('accepted', 'running');

CREATE OR REPLACE FUNCTION axwise.protect_cognitive_operation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, axwise
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
    OR OLD.input_payload <> NEW.input_payload
    OR OLD.created_at <> NEW.created_at THEN
    RAISE EXCEPTION 'cognitive operation identity and input are immutable' USING ERRCODE = '55000';
  END IF;
  IF OLD.status IN ('completed', 'failed') THEN
    RAISE EXCEPTION 'terminal cognitive operation is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.execution_count < OLD.execution_count THEN
    RAISE EXCEPTION 'cognitive operation execution count cannot decrease' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE TRIGGER cognitive_operations_protect
BEFORE UPDATE OR DELETE ON axwise.cognitive_operations
FOR EACH ROW EXECUTE FUNCTION axwise.protect_cognitive_operation();

ALTER TABLE axwise.cognitive_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE axwise.cognitive_operations FORCE ROW LEVEL SECURITY;
CREATE POLICY cognitive_operations_tenant_isolation
ON axwise.cognitive_operations
TO axwise_v2_api, axwise_v2_worker
USING (
  tenant_id = NULLIF(current_setting('axwise.tenant_id', true), '')::uuid
)
WITH CHECK (
  tenant_id = NULLIF(current_setting('axwise.tenant_id', true), '')::uuid
);

CREATE POLICY cognitive_operations_system_owner
ON axwise.cognitive_operations
TO axwise_v2_owner
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION axwise.claim_cognitive_operation(
  p_lease_token uuid,
  p_lease_seconds integer
)
RETURNS TABLE (
  operation_id uuid,
  tenant_id uuid,
  canonical_input_hash text,
  status text,
  result_payload jsonb,
  retryable boolean,
  error_class text,
  input_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axwise
AS $$
BEGIN
  IF p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'operation lease must be between 30 and 3600 seconds'
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  WITH candidate AS (
    SELECT value.operation_id
    FROM axwise.cognitive_operations AS value
    WHERE value.status = 'accepted'
       OR (value.status = 'running' AND value.lease_expires_at <= clock_timestamp())
    ORDER BY value.created_at, value.operation_id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE axwise.cognitive_operations AS value
  SET status = 'running',
      lease_token = p_lease_token,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      execution_count = value.execution_count + 1,
      started_at = COALESCE(value.started_at, clock_timestamp()),
      last_heartbeat_at = clock_timestamp()
  FROM candidate
  WHERE value.operation_id = candidate.operation_id
  RETURNING value.operation_id, value.tenant_id, value.canonical_input_hash,
            value.status, value.result_payload, value.retryable, value.error_class,
            value.input_payload;
END
$$;

CREATE OR REPLACE FUNCTION axwise.renew_cognitive_operation(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_lease_token uuid,
  p_lease_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axwise
AS $$
DECLARE
  changed integer;
BEGIN
  IF p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'operation lease must be between 30 and 3600 seconds'
      USING ERRCODE = '22023';
  END IF;
  UPDATE axwise.cognitive_operations
  SET lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      last_heartbeat_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id
    AND operation_id = p_operation_id
    AND status = 'running'
    AND lease_token = p_lease_token
    AND lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$$;

CREATE OR REPLACE FUNCTION axwise.complete_cognitive_operation(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_lease_token uuid,
  p_result_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axwise
AS $$
DECLARE
  changed integer;
BEGIN
  IF p_result_payload IS NULL OR jsonb_typeof(p_result_payload) <> 'object' THEN
    RAISE EXCEPTION 'completion result must be a JSON object' USING ERRCODE = '22023';
  END IF;
  UPDATE axwise.cognitive_operations
  SET status = 'completed', result_payload = p_result_payload,
      retryable = NULL, error_class = NULL,
      lease_token = NULL, lease_expires_at = NULL,
      last_heartbeat_at = clock_timestamp(), completed_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id
    AND operation_id = p_operation_id
    AND status = 'running'
    AND lease_token = p_lease_token
    AND lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$$;

CREATE OR REPLACE FUNCTION axwise.fail_cognitive_operation(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_lease_token uuid,
  p_retryable boolean,
  p_error_class text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axwise
AS $$
DECLARE
  changed integer;
BEGIN
  IF p_retryable IS NULL OR p_error_class IS NULL
    OR length(p_error_class) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'failure disposition is required' USING ERRCODE = '22023';
  END IF;
  UPDATE axwise.cognitive_operations
  SET status = 'failed', result_payload = NULL,
      retryable = p_retryable, error_class = p_error_class,
      lease_token = NULL, lease_expires_at = NULL,
      last_heartbeat_at = clock_timestamp(), completed_at = clock_timestamp()
  WHERE tenant_id = p_tenant_id
    AND operation_id = p_operation_id
    AND status = 'running'
    AND lease_token = p_lease_token
    AND lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed = 1;
END
$$;

ALTER FUNCTION axwise.claim_cognitive_operation(uuid, integer) OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.renew_cognitive_operation(uuid, uuid, uuid, integer)
  OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.complete_cognitive_operation(uuid, uuid, uuid, jsonb)
  OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.fail_cognitive_operation(uuid, uuid, uuid, boolean, text)
  OWNER TO axwise_v2_owner;
REVOKE CREATE ON SCHEMA axwise FROM axwise_v2_owner;

REVOKE ALL ON SCHEMA axwise FROM PUBLIC;
REVOKE ALL ON axwise.cognitive_operations FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.claim_cognitive_operation(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.renew_cognitive_operation(uuid, uuid, uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.complete_cognitive_operation(uuid, uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.fail_cognitive_operation(uuid, uuid, uuid, boolean, text) FROM PUBLIC;
GRANT USAGE ON SCHEMA axwise TO axwise_v2_owner, axwise_v2_api, axwise_v2_worker;
GRANT SELECT, INSERT ON axwise.cognitive_operations TO axwise_v2_api;
GRANT SELECT ON axwise.cognitive_operations TO axwise_v2_worker;
GRANT SELECT, UPDATE ON axwise.cognitive_operations TO axwise_v2_owner;
GRANT EXECUTE ON FUNCTION axwise.claim_cognitive_operation(uuid, integer)
  TO axwise_v2_worker;
GRANT EXECUTE ON FUNCTION axwise.renew_cognitive_operation(uuid, uuid, uuid, integer)
  TO axwise_v2_worker;
GRANT EXECUTE ON FUNCTION axwise.complete_cognitive_operation(uuid, uuid, uuid, jsonb)
  TO axwise_v2_worker;
GRANT EXECUTE ON FUNCTION axwise.fail_cognitive_operation(uuid, uuid, uuid, boolean, text)
  TO axwise_v2_worker;
REVOKE axwise_v2_owner FROM CURRENT_USER;

COMMIT;
