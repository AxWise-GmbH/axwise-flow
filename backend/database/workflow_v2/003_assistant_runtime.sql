BEGIN;

ALTER TABLE axwise.cognitive_operations
  ADD COLUMN retry_at timestamptz NULL,
  ADD COLUMN retry_after_seconds integer NULL,
  ADD COLUMN failure_diagnostics jsonb NULL,
  ADD CONSTRAINT cognitive_operations_retry_after_check CHECK (
    retry_after_seconds IS NULL OR retry_after_seconds BETWEEN 1 AND 900
  ),
  ADD CONSTRAINT cognitive_operations_failure_diagnostics_check CHECK (
    failure_diagnostics IS NULL OR (
      jsonb_typeof(failure_diagnostics) = 'object'
      AND octet_length(failure_diagnostics::text) <= 4096
    )
  ),
  ADD CONSTRAINT cognitive_operations_failure_metadata_state_check CHECK (
    (status = 'failed') OR (
      retry_at IS NULL
      AND retry_after_seconds IS NULL
      AND failure_diagnostics IS NULL
    )
  ),
  ADD CONSTRAINT cognitive_operations_retry_guidance_check CHECK (
    retryable IS TRUE OR (retry_at IS NULL AND retry_after_seconds IS NULL)
  );

CREATE FUNCTION axwise.safe_failure_phase_diagnostics(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, axwise
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN false
    ELSE COALESCE((
      NOT EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_value) AS key(value)
        WHERE key.value NOT IN (
          'route', 'status', 'elapsed_ms', 'call_count', 'retry_count',
          'upstream_status_code', 'primary_skipped', 'circuit_state',
          'retry_after_seconds'
        )
      )
      AND p_value ? 'route'
      AND jsonb_typeof(p_value -> 'route') = 'string'
      AND (p_value ->> 'route') ~ '^[A-Za-z0-9_:-]{1,100}$'
      AND p_value ? 'status'
      AND jsonb_typeof(p_value -> 'status') = 'string'
      AND (p_value ->> 'status') ~ '^[A-Za-z0-9_:-]{1,100}$'
      AND CASE WHEN p_value ? 'elapsed_ms' THEN
        jsonb_typeof(p_value -> 'elapsed_ms') = 'number'
        AND (p_value ->> 'elapsed_ms') ~ '^(0|[1-9][0-9]{0,5})$'
        AND (p_value ->> 'elapsed_ms')::integer BETWEEN 0 AND 900000
      ELSE true END
      AND CASE WHEN p_value ? 'call_count' THEN
        jsonb_typeof(p_value -> 'call_count') = 'number'
        AND (p_value ->> 'call_count') ~ '^(0|[1-9][0-9]{0,2})$'
        AND (p_value ->> 'call_count')::integer BETWEEN 0 AND 100
      ELSE true END
      AND CASE WHEN p_value ? 'retry_count' THEN
        jsonb_typeof(p_value -> 'retry_count') = 'number'
        AND (p_value ->> 'retry_count') ~ '^(0|[1-9][0-9]{0,2})$'
        AND (p_value ->> 'retry_count')::integer BETWEEN 0 AND 100
      ELSE true END
      AND CASE WHEN p_value ? 'upstream_status_code' THEN
        jsonb_typeof(p_value -> 'upstream_status_code') = 'number'
        AND (p_value ->> 'upstream_status_code') ~ '^[1-5][0-9]{2}$'
        AND (p_value ->> 'upstream_status_code')::integer BETWEEN 100 AND 599
      ELSE true END
      AND CASE WHEN p_value ? 'retry_after_seconds' THEN
        jsonb_typeof(p_value -> 'retry_after_seconds') = 'number'
        AND (p_value ->> 'retry_after_seconds') ~ '^[1-9][0-9]{0,2}$'
        AND (p_value ->> 'retry_after_seconds')::integer BETWEEN 1 AND 900
      ELSE true END
      AND CASE WHEN p_value ? 'primary_skipped' THEN
        jsonb_typeof(p_value -> 'primary_skipped') = 'boolean'
      ELSE true END
      AND CASE WHEN p_value ? 'circuit_state' THEN
        jsonb_typeof(p_value -> 'circuit_state') = 'string'
        AND p_value ->> 'circuit_state' = 'open'
        AND p_value -> 'primary_skipped' = 'true'::jsonb
      WHEN p_value -> 'primary_skipped' = 'true'::jsonb THEN false
      ELSE true END
    ), false)
  END
$$;

CREATE FUNCTION axwise.safe_failure_diagnostics(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = pg_catalog, axwise
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_value) IS DISTINCT FROM 'object' THEN false
    ELSE COALESCE((
      NOT EXISTS (
        SELECT 1
        FROM jsonb_object_keys(p_value) AS key(value)
        WHERE key.value NOT IN (
          'route', 'status', 'elapsed_ms', 'call_count', 'retry_count',
          'upstream_status_code', 'primary_skipped', 'circuit_state',
          'retry_after_seconds', 'primary_status', 'fallback_attempted',
          'fallback_used', 'primary', 'fallback', 'discovery'
        )
      )
      AND axwise.safe_failure_phase_diagnostics(
        p_value - ARRAY[
          'primary_status', 'fallback_attempted', 'fallback_used',
          'primary', 'fallback', 'discovery'
        ]::text[]
      )
      AND CASE WHEN p_value ? 'primary_status' THEN
        jsonb_typeof(p_value -> 'primary_status') = 'string'
        AND (p_value ->> 'primary_status') ~ '^[A-Za-z0-9_:-]{1,100}$'
      ELSE true END
      AND CASE WHEN p_value ? 'fallback_attempted' THEN
        jsonb_typeof(p_value -> 'fallback_attempted') = 'boolean'
      ELSE true END
      AND CASE WHEN p_value ? 'fallback_used' THEN
        jsonb_typeof(p_value -> 'fallback_used') = 'boolean'
      ELSE true END
      AND CASE WHEN p_value ? 'primary' THEN
        axwise.safe_failure_phase_diagnostics(p_value -> 'primary')
      ELSE true END
      AND CASE WHEN p_value ? 'fallback' THEN
        axwise.safe_failure_phase_diagnostics(p_value -> 'fallback')
      ELSE true END
      AND CASE WHEN p_value ? 'discovery' THEN
        axwise.safe_failure_phase_diagnostics(p_value -> 'discovery')
      ELSE true END
    ), false)
  END
$$;

CREATE FUNCTION axwise.fail_cognitive_operation(
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

GRANT axwise_v2_owner TO CURRENT_USER;
GRANT CREATE ON SCHEMA axwise TO axwise_v2_owner;
ALTER FUNCTION axwise.safe_failure_phase_diagnostics(jsonb)
  OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.safe_failure_diagnostics(jsonb)
  OWNER TO axwise_v2_owner;
ALTER FUNCTION axwise.fail_cognitive_operation(
  uuid, uuid, uuid, boolean, text, timestamptz, integer, jsonb
) OWNER TO axwise_v2_owner;

REVOKE ALL ON FUNCTION axwise.safe_failure_phase_diagnostics(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.safe_failure_diagnostics(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION axwise.fail_cognitive_operation(
  uuid, uuid, uuid, boolean, text, timestamptz, integer, jsonb
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION axwise.fail_cognitive_operation(
  uuid, uuid, uuid, boolean, text, timestamptz, integer, jsonb
) TO axwise_v2_worker;
REVOKE CREATE ON SCHEMA axwise FROM axwise_v2_owner;
REVOKE axwise_v2_owner FROM CURRENT_USER;

COMMIT;
