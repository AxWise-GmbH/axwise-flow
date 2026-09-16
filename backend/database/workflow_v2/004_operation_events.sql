BEGIN;

GRANT axwise_v2_owner TO CURRENT_USER;
GRANT CREATE ON SCHEMA axwise TO axwise_v2_owner;

DO $$
DECLARE
  status_constraint name;
  state_constraint name;
BEGIN
  SELECT candidate.conname
    INTO status_constraint
    FROM pg_constraint AS candidate
   WHERE candidate.conrelid = 'axwise.cognitive_operations'::regclass
     AND candidate.contype = 'c'
     AND pg_get_constraintdef(candidate.oid) LIKE '%status%'
     AND pg_get_constraintdef(candidate.oid) LIKE '%accepted%'
     AND pg_get_constraintdef(candidate.oid) LIKE '%running%'
     AND pg_get_constraintdef(candidate.oid) NOT LIKE '%lease_token%';
  SELECT candidate.conname
    INTO state_constraint
    FROM pg_constraint AS candidate
   WHERE candidate.conrelid = 'axwise.cognitive_operations'::regclass
     AND candidate.contype = 'c'
     AND pg_get_constraintdef(candidate.oid) LIKE '%status%'
     AND pg_get_constraintdef(candidate.oid) LIKE '%lease_token%'
     AND pg_get_constraintdef(candidate.oid) LIKE '%result_payload%';
  IF status_constraint IS NULL OR state_constraint IS NULL THEN
    RAISE EXCEPTION 'cognitive operation lifecycle constraints not found';
  END IF;
  EXECUTE format(
    'ALTER TABLE axwise.cognitive_operations DROP CONSTRAINT %I',
    status_constraint
  );
  EXECUTE format(
    'ALTER TABLE axwise.cognitive_operations DROP CONSTRAINT %I',
    state_constraint
  );
END
$$;

ALTER TABLE axwise.cognitive_operations
  ADD COLUMN event_sequence bigint NOT NULL DEFAULT 1 CHECK (event_sequence >= 1),
  ADD CONSTRAINT cognitive_operations_tenant_operation_key
    UNIQUE (tenant_id, operation_id),
  ADD CONSTRAINT cognitive_operations_status_check CHECK (
    status IN (
      'accepted', 'running', 'cancel_requested',
      'cancelled', 'completed', 'failed'
    )
  ),
  ADD CONSTRAINT cognitive_operations_lifecycle_state_check CHECK (
    (status = 'accepted' AND lease_token IS NULL AND lease_expires_at IS NULL
      AND result_payload IS NULL AND retryable IS NULL AND error_class IS NULL) OR
    (status = 'running' AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL
      AND result_payload IS NULL AND retryable IS NULL AND error_class IS NULL) OR
    (status = 'cancel_requested'
      AND ((lease_token IS NULL AND lease_expires_at IS NULL)
        OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL))
      AND result_payload IS NULL AND retryable IS NULL AND error_class IS NULL) OR
    (status = 'cancelled' AND lease_token IS NULL AND lease_expires_at IS NULL
      AND result_payload IS NULL AND retryable IS NULL AND error_class IS NULL) OR
    (status = 'completed' AND lease_token IS NULL AND lease_expires_at IS NULL
      AND result_payload IS NOT NULL AND retryable IS NULL AND error_class IS NULL) OR
    (status = 'failed' AND lease_token IS NULL AND lease_expires_at IS NULL
      AND result_payload IS NULL AND retryable IS NOT NULL AND error_class IS NOT NULL)
  );

DROP INDEX axwise.cognitive_operations_recovery_idx;
CREATE INDEX cognitive_operations_recovery_idx
  ON axwise.cognitive_operations (created_at, lease_expires_at)
  WHERE status IN ('accepted', 'running', 'cancel_requested');

CREATE TABLE axwise.operation_events (
  tenant_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence >= 1),
  event_type text NOT NULL CHECK (event_type IN (
    'accepted', 'running', 'heartbeat', 'cancel_requested',
    'cancelled', 'completed', 'failed'
  )),
  status text NOT NULL CHECK (status IN (
    'accepted', 'running', 'cancel_requested',
    'cancelled', 'completed', 'failed'
  )),
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  retryable boolean NULL,
  error_class text NULL CHECK (
    error_class IS NULL OR length(error_class) BETWEEN 1 AND 200
  ),
  retry_at timestamptz NULL,
  retry_after_seconds integer NULL CHECK (
    retry_after_seconds IS NULL OR retry_after_seconds BETWEEN 1 AND 900
  ),
  failure_diagnostics jsonb NULL CHECK (
    failure_diagnostics IS NULL OR (
      jsonb_typeof(failure_diagnostics) = 'object'
      AND octet_length(failure_diagnostics::text) <= 4096
      AND axwise.safe_failure_diagnostics(failure_diagnostics)
    )
  ),
  PRIMARY KEY (operation_id, sequence),
  FOREIGN KEY (tenant_id, operation_id)
    REFERENCES axwise.cognitive_operations(tenant_id, operation_id),
  CHECK (
    (event_type = 'accepted' AND status = 'accepted') OR
    (event_type = 'running' AND status = 'running') OR
    (event_type = 'heartbeat' AND status IN ('running', 'cancel_requested')) OR
    (event_type = 'cancel_requested' AND status = 'cancel_requested') OR
    (event_type = 'cancelled' AND status = 'cancelled') OR
    (event_type = 'completed' AND status = 'completed') OR
    (event_type = 'failed' AND status = 'failed')
  ),
  CHECK (
    (event_type = 'failed' AND retryable IS NOT NULL AND error_class IS NOT NULL) OR
    (event_type <> 'failed' AND retryable IS NULL AND error_class IS NULL
      AND retry_at IS NULL AND retry_after_seconds IS NULL
      AND failure_diagnostics IS NULL)
  ),
  CHECK (retryable IS TRUE OR (retry_at IS NULL AND retry_after_seconds IS NULL))
);

CREATE INDEX operation_events_tenant_cursor_idx
  ON axwise.operation_events (tenant_id, operation_id, sequence);

INSERT INTO axwise.operation_events (
  tenant_id, operation_id, sequence, event_type, status, occurred_at,
  retryable, error_class, retry_at, retry_after_seconds, failure_diagnostics
)
SELECT
  tenant_id,
  operation_id,
  1,
  status,
  status,
  COALESCE(completed_at, last_heartbeat_at, started_at, created_at),
  retryable,
  error_class,
  retry_at,
  retry_after_seconds,
  failure_diagnostics
FROM axwise.cognitive_operations;

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
  IF OLD.status IN ('cancelled', 'completed', 'failed') THEN
    RAISE EXCEPTION 'terminal cognitive operation is immutable' USING ERRCODE = '55000';
  END IF;
  IF NEW.execution_count < OLD.execution_count THEN
    RAISE EXCEPTION 'cognitive operation execution count cannot decrease' USING ERRCODE = '55000';
  END IF;
  IF NEW.event_sequence < OLD.event_sequence THEN
    RAISE EXCEPTION 'cognitive operation event sequence cannot decrease' USING ERRCODE = '55000';
  END IF;
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE FUNCTION axwise.protect_operation_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, axwise
AS $$
BEGIN
  RAISE EXCEPTION 'operation lifecycle events are append-only' USING ERRCODE = '55000';
END
$$;

CREATE TRIGGER operation_events_append_only
BEFORE UPDATE OR DELETE ON axwise.operation_events
FOR EACH ROW EXECUTE FUNCTION axwise.protect_operation_event();

CREATE FUNCTION axwise.emit_cognitive_operation_accepted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axwise
AS $$
BEGIN
  INSERT INTO axwise.operation_events (
    tenant_id, operation_id, sequence, event_type, status, occurred_at
  ) VALUES (
    NEW.tenant_id, NEW.operation_id, NEW.event_sequence,
    'accepted', 'accepted', NEW.created_at
  );
  RETURN NEW;
END
$$;

CREATE TRIGGER cognitive_operations_emit_accepted
AFTER INSERT ON axwise.cognitive_operations
FOR EACH ROW EXECUTE FUNCTION axwise.emit_cognitive_operation_accepted();

ALTER TABLE axwise.operation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE axwise.operation_events FORCE ROW LEVEL SECURITY;
CREATE POLICY operation_events_tenant_isolation
ON axwise.operation_events
TO axwise_v2_api, axwise_v2_worker
USING (
  tenant_id = NULLIF(current_setting('axwise.tenant_id', true), '')::uuid
);
CREATE POLICY operation_events_system_owner
ON axwise.operation_events
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
    SELECT value.operation_id, value.status
    FROM axwise.cognitive_operations AS value
    WHERE value.status = 'accepted'
       OR (value.status = 'running' AND value.lease_expires_at <= clock_timestamp())
       OR (value.status = 'cancel_requested'
           AND (value.lease_expires_at IS NULL
                OR value.lease_expires_at <= clock_timestamp()))
    ORDER BY value.created_at, value.operation_id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  ), updated AS (
    UPDATE axwise.cognitive_operations AS value
    SET status = CASE
          WHEN candidate.status = 'cancel_requested' THEN 'cancel_requested'
          ELSE 'running'
        END,
        lease_token = p_lease_token,
        lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
        execution_count = value.execution_count + 1,
        event_sequence = value.event_sequence + 1,
        started_at = COALESCE(value.started_at, clock_timestamp()),
        last_heartbeat_at = clock_timestamp()
    FROM candidate
    WHERE value.operation_id = candidate.operation_id
    RETURNING value.operation_id, value.tenant_id, value.canonical_input_hash,
              value.status, value.result_payload, value.retryable, value.error_class,
              value.input_payload, value.event_sequence, value.last_heartbeat_at
  ), emitted AS (
    INSERT INTO axwise.operation_events (
      tenant_id, operation_id, sequence, event_type, status, occurred_at
    )
    SELECT updated.tenant_id, updated.operation_id, updated.event_sequence,
           CASE
             WHEN updated.status = 'cancel_requested' THEN 'heartbeat'
             ELSE 'running'
           END,
           updated.status, updated.last_heartbeat_at
    FROM updated
    RETURNING 1 AS emitted
  )
  SELECT updated.operation_id, updated.tenant_id, updated.canonical_input_hash,
         updated.status, updated.result_payload, updated.retryable,
         updated.error_class, updated.input_payload
  FROM updated
  CROSS JOIN emitted;
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
  event_tenant_id uuid;
  heartbeat_sequence bigint;
  event_time timestamptz := clock_timestamp();
BEGIN
  IF p_lease_seconds < 30 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'operation lease must be between 30 and 3600 seconds'
      USING ERRCODE = '22023';
  END IF;
  UPDATE axwise.cognitive_operations AS value
  SET lease_expires_at = event_time + make_interval(secs => p_lease_seconds),
      last_heartbeat_at = event_time,
      event_sequence = value.event_sequence + 1
  WHERE value.tenant_id = p_tenant_id
    AND value.operation_id = p_operation_id
    AND value.status = 'running'
    AND value.lease_token = p_lease_token
    AND value.lease_expires_at > event_time
  RETURNING value.tenant_id, value.event_sequence
    INTO event_tenant_id, heartbeat_sequence;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    INSERT INTO axwise.operation_events (
      tenant_id, operation_id, sequence, event_type, status, occurred_at
    ) VALUES (
      event_tenant_id, p_operation_id, heartbeat_sequence,
      'heartbeat', 'running', event_time
    );
  END IF;
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
  event_tenant_id uuid;
  terminal_sequence bigint;
  terminal_time timestamptz := clock_timestamp();
BEGIN
  IF p_result_payload IS NULL OR jsonb_typeof(p_result_payload) <> 'object' THEN
    RAISE EXCEPTION 'completion result must be a JSON object' USING ERRCODE = '22023';
  END IF;
  UPDATE axwise.cognitive_operations
  SET status = 'completed', result_payload = p_result_payload,
      retryable = NULL, error_class = NULL,
      retry_at = NULL, retry_after_seconds = NULL, failure_diagnostics = NULL,
      lease_token = NULL, lease_expires_at = NULL,
      event_sequence = event_sequence + 1,
      last_heartbeat_at = terminal_time, completed_at = terminal_time
  WHERE tenant_id = p_tenant_id
    AND operation_id = p_operation_id
    AND status = 'running'
    AND lease_token = p_lease_token
    AND lease_expires_at > terminal_time
  RETURNING tenant_id, event_sequence INTO event_tenant_id, terminal_sequence;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    INSERT INTO axwise.operation_events (
      tenant_id, operation_id, sequence, event_type, status, occurred_at
    ) VALUES (
      event_tenant_id, p_operation_id, terminal_sequence,
      'completed', 'completed', terminal_time
    );
  END IF;
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
  event_tenant_id uuid;
  terminal_sequence bigint;
  terminal_time timestamptz := clock_timestamp();
BEGIN
  IF p_retryable IS NULL OR p_error_class IS NULL
    OR length(p_error_class) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'failure disposition is required' USING ERRCODE = '22023';
  END IF;
  UPDATE axwise.cognitive_operations
  SET status = 'failed', result_payload = NULL,
      retryable = p_retryable, error_class = p_error_class,
      retry_at = NULL, retry_after_seconds = NULL, failure_diagnostics = NULL,
      lease_token = NULL, lease_expires_at = NULL,
      event_sequence = event_sequence + 1,
      last_heartbeat_at = terminal_time, completed_at = terminal_time
  WHERE tenant_id = p_tenant_id
    AND operation_id = p_operation_id
    AND status = 'running'
    AND lease_token = p_lease_token
    AND lease_expires_at > terminal_time
  RETURNING tenant_id, event_sequence INTO event_tenant_id, terminal_sequence;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    INSERT INTO axwise.operation_events (
      tenant_id, operation_id, sequence, event_type, status, occurred_at,
      retryable, error_class
    ) VALUES (
      event_tenant_id, p_operation_id, terminal_sequence,
      'failed', 'failed', terminal_time, p_retryable, p_error_class
    );
  END IF;
  RETURN changed = 1;
END
$$;

CREATE OR REPLACE FUNCTION axwise.fail_cognitive_operation(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_lease_token uuid,
  p_retryable boolean,
  p_error_class text,
  p_retry_at timestamptz,
  p_retry_after_seconds integer,
  p_failure_diagnostics jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axwise
AS $$
DECLARE
  changed integer;
  event_tenant_id uuid;
  terminal_sequence bigint;
  terminal_time timestamptz := clock_timestamp();
BEGIN
  IF p_retryable IS NULL OR p_error_class IS NULL
    OR length(p_error_class) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'failure disposition is required' USING ERRCODE = '22023';
  END IF;
  IF p_retryable IS NOT TRUE
    AND (p_retry_at IS NOT NULL OR p_retry_after_seconds IS NOT NULL) THEN
    RAISE EXCEPTION 'retry timing requires a retryable failure'
      USING ERRCODE = '22023';
  END IF;
  IF p_retry_after_seconds IS NOT NULL
    AND p_retry_after_seconds NOT BETWEEN 1 AND 900 THEN
    RAISE EXCEPTION 'retry delay must be between 1 and 900 seconds'
      USING ERRCODE = '22023';
  END IF;
  IF p_failure_diagnostics IS NOT NULL AND (
    octet_length(p_failure_diagnostics::text) > 4096
    OR NOT axwise.safe_failure_diagnostics(p_failure_diagnostics)
  ) THEN
    RAISE EXCEPTION 'failure diagnostics must use the safe bounded schema'
      USING ERRCODE = '22023';
  END IF;
  UPDATE axwise.cognitive_operations
  SET status = 'failed', result_payload = NULL,
      retryable = p_retryable, error_class = p_error_class,
      retry_at = p_retry_at, retry_after_seconds = p_retry_after_seconds,
      failure_diagnostics = p_failure_diagnostics,
      lease_token = NULL, lease_expires_at = NULL,
      event_sequence = event_sequence + 1,
      last_heartbeat_at = terminal_time, completed_at = terminal_time
  WHERE tenant_id = p_tenant_id
    AND operation_id = p_operation_id
    AND status = 'running'
    AND lease_token = p_lease_token
    AND lease_expires_at > terminal_time
  RETURNING tenant_id, event_sequence INTO event_tenant_id, terminal_sequence;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    INSERT INTO axwise.operation_events (
      tenant_id, operation_id, sequence, event_type, status, occurred_at,
      retryable, error_class, retry_at, retry_after_seconds, failure_diagnostics
    ) VALUES (
      event_tenant_id, p_operation_id, terminal_sequence,
      'failed', 'failed', terminal_time, p_retryable, p_error_class,
      p_retry_at, p_retry_after_seconds, p_failure_diagnostics
    );
  END IF;
  RETURN changed = 1;
END
$$;

CREATE FUNCTION axwise.request_cognitive_operation_cancel(
  p_tenant_id uuid,
  p_operation_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axwise
AS $$
DECLARE
  operation_row axwise.cognitive_operations%ROWTYPE;
  transition_time timestamptz := clock_timestamp();
BEGIN
  IF NULLIF(current_setting('axwise.tenant_id', true), '')
    IS DISTINCT FROM p_tenant_id::text THEN
    RETURN NULL;
  END IF;
  SELECT * INTO operation_row
  FROM axwise.cognitive_operations
  WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;
  IF operation_row.status = 'accepted' THEN
    UPDATE axwise.cognitive_operations
    SET status = 'cancel_requested', event_sequence = event_sequence + 1
    WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id
    RETURNING * INTO operation_row;
    INSERT INTO axwise.operation_events (
      tenant_id, operation_id, sequence, event_type, status, occurred_at
    ) VALUES (
      operation_row.tenant_id, operation_row.operation_id,
      operation_row.event_sequence, 'cancel_requested', 'cancel_requested',
      transition_time
    );
    UPDATE axwise.cognitive_operations
    SET status = 'cancelled', event_sequence = event_sequence + 1,
        completed_at = transition_time
    WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id
    RETURNING * INTO operation_row;
    INSERT INTO axwise.operation_events (
      tenant_id, operation_id, sequence, event_type, status, occurred_at
    ) VALUES (
      operation_row.tenant_id, operation_row.operation_id,
      operation_row.event_sequence, 'cancelled', 'cancelled', transition_time
    );
    RETURN 'cancelled';
  END IF;
  IF operation_row.status = 'running' THEN
    UPDATE axwise.cognitive_operations
    SET status = 'cancel_requested', event_sequence = event_sequence + 1
    WHERE tenant_id = p_tenant_id AND operation_id = p_operation_id
    RETURNING * INTO operation_row;
    INSERT INTO axwise.operation_events (
      tenant_id, operation_id, sequence, event_type, status, occurred_at
    ) VALUES (
      operation_row.tenant_id, operation_row.operation_id,
      operation_row.event_sequence, 'cancel_requested', 'cancel_requested',
      transition_time
    );
    RETURN 'cancel_requested';
  END IF;
  RETURN operation_row.status;
END
$$;

CREATE FUNCTION axwise.cancel_cognitive_operation(
  p_tenant_id uuid,
  p_operation_id uuid,
  p_lease_token uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, axwise
AS $$
DECLARE
  changed integer;
  event_tenant_id uuid;
  terminal_sequence bigint;
  terminal_time timestamptz := clock_timestamp();
BEGIN
  UPDATE axwise.cognitive_operations
  SET status = 'cancelled', result_payload = NULL,
      retryable = NULL, error_class = NULL,
      retry_at = NULL, retry_after_seconds = NULL, failure_diagnostics = NULL,
      lease_token = NULL, lease_expires_at = NULL,
      event_sequence = event_sequence + 1,
      last_heartbeat_at = terminal_time, completed_at = terminal_time
  WHERE tenant_id = p_tenant_id
    AND operation_id = p_operation_id
    AND status = 'cancel_requested'
    AND lease_token = p_lease_token
    AND lease_expires_at > terminal_time
  RETURNING tenant_id, event_sequence INTO event_tenant_id, terminal_sequence;
  GET DIAGNOSTICS changed = ROW_COUNT;
  IF changed = 1 THEN
    INSERT INTO axwise.operation_events (
      tenant_id, operation_id, sequence, event_type, status, occurred_at
    ) VALUES (
      event_tenant_id, p_operation_id, terminal_sequence,
      'cancelled', 'cancelled', terminal_time
    );
  END IF;
  RETURN changed = 1;
END
$$;

ALTER TABLE axwise.operation_events OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.protect_cognitive_operation() OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.protect_operation_event() OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.emit_cognitive_operation_accepted() OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.claim_cognitive_operation(uuid, integer)
  OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.renew_cognitive_operation(uuid, uuid, uuid, integer)
  OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.complete_cognitive_operation(uuid, uuid, uuid, jsonb)
  OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.fail_cognitive_operation(uuid, uuid, uuid, boolean, text)
  OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.fail_cognitive_operation(
  uuid, uuid, uuid, boolean, text, timestamptz, integer, jsonb
) OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.request_cognitive_operation_cancel(uuid, uuid)
  OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.cancel_cognitive_operation(uuid, uuid, uuid)
  OWNER TO axwise_v2_owner;

REVOKE ALL ON axwise.operation_events FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.protect_operation_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.emit_cognitive_operation_accepted() FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.request_cognitive_operation_cancel(uuid, uuid)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.cancel_cognitive_operation(uuid, uuid, uuid)
  FROM PUBLIC;
GRANT SELECT ON axwise.operation_events TO axwise_v2_api;
GRANT EXECUTE ON FUNCTION axwise.request_cognitive_operation_cancel(uuid, uuid)
  TO axwise_v2_api;
GRANT EXECUTE ON FUNCTION axwise.cancel_cognitive_operation(uuid, uuid, uuid)
  TO axwise_v2_worker;
REVOKE CREATE ON SCHEMA axwise FROM axwise_v2_owner;
REVOKE axwise_v2_owner FROM CURRENT_USER;

COMMIT;
