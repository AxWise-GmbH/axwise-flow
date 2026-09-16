BEGIN;

-- No worker UPDATE grant on connection status or credential material. This
-- narrow transition consumes an exact immutable successful, user-consented
-- native test and never changes provider IDs, scope, ownership or revocation.
CREATE FUNCTION orqaly.verify_native_outbound_connection(p_test_id uuid,p_connection_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE t orqaly.solution_build_tests%ROWTYPE;
DECLARE b orqaly.solution_build_requests%ROWTYPE;
DECLARE c orqaly.solution_connections%ROWTYPE;
DECLARE tenant uuid := orqaly.current_tenant_id();
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_worker','member') OR tenant IS NULL THEN
    RAISE EXCEPTION 'worker tenant scope required' USING ERRCODE='42501';
  END IF;
  SELECT * INTO t FROM orqaly.solution_build_tests WHERE tenant_id=tenant AND id=p_test_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'outbound test proof required' USING ERRCODE='42501'; END IF;
  IF t.owner_user_id IS DISTINCT FROM current_setting('orqaly.build_owner_user_id',true) THEN
    RAISE EXCEPTION 'outbound owner scope required' USING ERRCODE='42501';
  END IF;
  -- Same build -> test -> connection lock order as the worker completion path.
  SELECT * INTO b FROM orqaly.solution_build_requests WHERE tenant_id=tenant AND id=t.build_request_id FOR SHARE;
  SELECT * INTO t FROM orqaly.solution_build_tests WHERE tenant_id=tenant AND id=p_test_id FOR SHARE;
  SELECT * INTO c FROM orqaly.solution_connections WHERE tenant_id=tenant AND id=p_connection_id FOR UPDATE;
  IF NOT FOUND OR c.status NOT IN ('saved','verified') OR c.credential_type<>'orqalyBoundedHttp' OR
     c.provider_credential_id IS NULL OR c.owner_user_id<>t.owner_user_id OR c.build_request_id<>t.build_request_id OR
     c.environment_id<>t.environment_id OR b.owner_user_id<>t.owner_user_id OR b.status IN ('cancelled','completed') OR
     b.input_version<>t.input_version OR b.workflow_hash<>t.workflow_hash OR b.environment_id<>t.environment_id THEN
    RAISE EXCEPTION 'outbound binding changed' USING ERRCODE='42501';
  END IF;
  IF (t.status='succeeded' AND t.completed_at IS NOT NULL AND
    t.configuration->>'kind'='live_connection' AND
    t.configuration->>'candidateFingerprint'=t.candidate_fingerprint AND
    t.configuration->'authorization'->>'kind'='user_request' AND
    t.configuration->'authorization'->'command'->>'allowExternalEffects'='true' AND
    t.configuration->'authorization'->'command'->>'workflowHash'=t.workflow_hash AND
    t.configuration->'connectionVersions' ? c.id::text AND
    t.evidence->>'status'='succeeded' AND t.evidence->>'workflowHash'=t.workflow_hash AND
    t.evidence->>'candidateFingerprint'=t.candidate_fingerprint AND
    jsonb_typeof(t.configuration->'cases')='array' AND jsonb_array_length(t.configuration->'cases')>0 AND
    jsonb_typeof(t.evidence->'caseResults')='array' AND
    jsonb_array_length(t.evidence->'caseResults')=jsonb_array_length(t.configuration->'cases') AND
    jsonb_typeof(c.scope->'targets')='array' AND jsonb_array_length(c.scope->'targets')=1
  ) IS NOT TRUE THEN
    RAISE EXCEPTION 'outbound successful consent proof required' USING ERRCODE='42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(t.configuration->'cases') configured
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(t.evidence->'caseResults') result
      WHERE result->>'id'=configured->>'id' AND result->>'workflowHash'=configured->>'workflowHash' AND
        result->>'passed'='true' AND result->>'status'='succeeded' AND
        result->>'executionId' ~ '^[1-9][0-9]{0,30}$' AND result->'cleanup'->>'status'='removed' AND
        result->'outboundDelivery'->>'delivery'='accepted' AND
        result->'outboundDelivery'->>'connectionId'=c.id::text AND
        result->'outboundDelivery'->>'nodeId'=c.scope->'targets'->0->>'nodeId'
    )
  ) OR NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(b.workflow->'nodes') node
    WHERE node->>'id'=c.scope->'targets'->0->>'nodeId' AND node->>'type'='CUSTOM.boundedHttp' AND
      node->>'typeVersion'='1' AND node->'credentials'->'orqalyBoundedHttp'->>'id'=c.provider_credential_id
  ) THEN
    RAISE EXCEPTION 'outbound execution proof mismatch' USING ERRCODE='42501';
  END IF;
  IF c.status='saved' THEN
    UPDATE orqaly.solution_connections SET status='verified',verified_at=clock_timestamp()
      WHERE tenant_id=tenant AND id=c.id AND status='saved';
  END IF;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION orqaly.verify_native_outbound_connection(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.verify_native_outbound_connection(uuid,uuid) TO orqaly_worker;

COMMIT;
