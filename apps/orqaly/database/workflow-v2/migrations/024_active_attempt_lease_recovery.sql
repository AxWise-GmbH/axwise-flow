BEGIN;

-- Terminal runs may retain expired running/polling attempts as historical
-- evidence. They are not recoverable work; never return them on every idle poll.
-- This matches assertActiveRun in the transition engine (running only).
CREATE OR REPLACE FUNCTION orqaly.list_expired_attempt_leases(p_limit integer DEFAULT 100)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
BEGIN
  IF NOT pg_has_role(session_user, 'orqaly_worker', 'member') THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT jsonb_build_object(
    'tenantId', attempt.tenant_id,
    'runId', attempt.run_id,
    'stageId', attempt.stage_id,
    'attemptId', attempt.id,
    'operationId', attempt.operation_id,
    'inputHash', attempt.input_hash,
    'status', attempt.status,
    'leaseToken', attempt.lease_token,
    'leaseExpiresAt', attempt.lease_expires_at,
    'observedAt', clock_timestamp()
  )
  FROM orqaly.stage_attempts AS attempt
  JOIN orqaly.workflow_runs AS run
    ON run.tenant_id = attempt.tenant_id AND run.id = attempt.run_id
   AND run.status = 'running'
  JOIN orqaly.outbox_events AS outbox
    ON outbox.tenant_id = attempt.tenant_id
   AND outbox.run_id = attempt.run_id
   AND outbox.stage_id = attempt.stage_id
   AND outbox.attempt_id = attempt.id
   AND outbox.operation_id = attempt.operation_id
   AND outbox.input_hash = attempt.input_hash
   AND outbox.status = 'processing'
   AND outbox.lease_token = attempt.lease_token
  WHERE attempt.status IN ('running', 'polling')
    AND attempt.lease_token IS NOT NULL
    AND attempt.lease_expires_at <= clock_timestamp()
  ORDER BY attempt.lease_expires_at, attempt.id
  LIMIT p_limit;
END
$$;

REVOKE ALL ON FUNCTION orqaly.list_expired_attempt_leases(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.list_expired_attempt_leases(integer) TO orqaly_worker;

-- Serialize the final active-state check with all existing run transitions.
-- No new table-write authority is granted to the worker login, and the original
-- transition function still validates event identity, hashes, versions and lease.
CREATE FUNCTION orqaly.recover_attempt_lease(p_tenant_id uuid, p_run_id uuid, p_plan jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE current_status text;
BEGIN
  IF NOT pg_has_role(session_user, 'orqaly_worker', 'member') OR
    orqaly.current_tenant_id() IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'worker tenant context required' USING ERRCODE = '42501';
  END IF;
  IF p_plan->'event'->>'type' IS DISTINCT FROM 'LeaseExpired' OR
    p_plan->'event'->>'tenantId' IS DISTINCT FROM p_tenant_id::text OR
    p_plan->'event'->>'runId' IS DISTINCT FROM p_run_id::text THEN
    RAISE EXCEPTION 'lease recovery event required' USING ERRCODE = '22023';
  END IF;
  SELECT run.status INTO current_status FROM orqaly.workflow_runs AS run
    WHERE run.tenant_id = p_tenant_id AND run.id = p_run_id FOR UPDATE;
  IF current_status IS DISTINCT FROM 'running' THEN
    RETURN jsonb_build_object('skipped', true, 'reason', 'run_not_active');
  END IF;
  RETURN orqaly.apply_transition(p_tenant_id, p_run_id, p_plan);
END
$$;
REVOKE ALL ON FUNCTION orqaly.recover_attempt_lease(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.recover_attempt_lease(uuid, uuid, jsonb) TO orqaly_worker;

COMMIT;
