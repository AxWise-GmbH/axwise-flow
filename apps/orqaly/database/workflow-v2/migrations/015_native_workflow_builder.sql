BEGIN;

-- V1 records retain their original contract and immutable source. V2 is an
-- additive authoring path, not a relaxation of the old mapping validator.
ALTER TABLE orqaly.customer_solutions DROP CONSTRAINT customer_solutions_spec_check;
ALTER TABLE orqaly.customer_solutions ADD CONSTRAINT customer_solutions_spec_check
  CHECK (spec->>'kind' IN ('webhook_transform_v1','n8n_workflow_v2'));

ALTER TABLE orqaly.solution_build_requests
  ADD COLUMN preparation_version integer NOT NULL DEFAULT 1 CHECK (preparation_version IN (1,2)),
  ADD COLUMN native_metadata jsonb NOT NULL DEFAULT '{}' CHECK
    (jsonb_typeof(native_metadata)='object' AND octet_length(native_metadata::text)<=512000),
  ADD COLUMN environment_id text UNIQUE,
  ADD COLUMN native_test_lease_token uuid,
  ADD COLUMN native_test_lease_expires_at timestamptz;
ALTER TABLE orqaly.solution_build_requests DROP CONSTRAINT solution_build_requests_status_check;
ALTER TABLE orqaly.solution_build_requests ADD CONSTRAINT solution_build_requests_status_check
  CHECK (status IN ('preparing','needs_input','draft','reviewed','completed','unsupported','failed','cancelled'));
ALTER TABLE orqaly.solution_build_events DROP CONSTRAINT solution_build_events_kind_check;
ALTER TABLE orqaly.solution_build_events ADD CONSTRAINT solution_build_events_kind_check
  CHECK (kind IN ('created','answered','saved','reviewed','handed_off','design_completed',
    'design_failed','design_superseded','retried','repair_requested','cancelled',
    'test_requested','test_started','test_completed','connection_requested','connection_saved','connection_revoked'));
GRANT UPDATE(native_metadata,environment_id) ON orqaly.solution_build_requests TO orqaly_api,orqaly_worker;
GRANT UPDATE(native_test_lease_token,native_test_lease_expires_at)
  ON orqaly.solution_build_requests TO orqaly_worker;

CREATE FUNCTION orqaly.guard_native_build_identity() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF NEW.preparation_version IS DISTINCT FROM OLD.preparation_version OR
     (OLD.environment_id IS NOT NULL AND NEW.environment_id IS DISTINCT FROM OLD.environment_id) THEN
    RAISE EXCEPTION 'native_build_binding_immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status='cancelled' THEN
    RAISE EXCEPTION 'native_build_cancelled' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER native_build_identity_guard BEFORE UPDATE ON orqaly.solution_build_requests
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_native_build_identity();

CREATE TABLE orqaly.solution_build_tests (
  tenant_id uuid NOT NULL,
  build_request_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL,
  input_version integer NOT NULL,
  workflow_hash char(64) NOT NULL CHECK (workflow_hash ~ '^[a-f0-9]{64}$'),
  candidate_fingerprint char(64) NOT NULL CHECK (candidate_fingerprint ~ '^[a-f0-9]{64}$'),
  test_artifact_hash char(64) NOT NULL CHECK (test_artifact_hash ~ '^[a-f0-9]{64}$'),
  environment_id text NOT NULL,
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 160),
  request_hash char(64) NOT NULL,
  configuration jsonb NOT NULL CHECK (octet_length(configuration::text)<=128000),
  status text NOT NULL CHECK (status IN ('running','succeeded','failed','outcome_unknown','cancelled')),
  evidence jsonb CHECK (octet_length(evidence::text)<=256000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,build_request_id,request_key),
  FOREIGN KEY (tenant_id,build_request_id,owner_user_id)
    REFERENCES orqaly.solution_build_requests(tenant_id,id,owner_user_id),
  CHECK ((status='running')=(completed_at IS NULL))
);
CREATE INDEX solution_build_tests_owner_idx
  ON orqaly.solution_build_tests(tenant_id,owner_user_id,build_request_id,created_at DESC);
CREATE UNIQUE INDEX solution_build_tests_inflight_idx
  ON orqaly.solution_build_tests(tenant_id,build_request_id) WHERE status='running';

-- Credential material never belongs here. Only the owned n8n credential ID and
-- immutable service/destination scope are retained in ordinary application data.
CREATE TABLE orqaly.solution_connections (
  tenant_id uuid NOT NULL,
  build_request_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL,
  requirement_id text NOT NULL CHECK (length(requirement_id) BETWEEN 1 AND 120),
  environment_id text NOT NULL,
  credential_type text NOT NULL CHECK (length(credential_type) BETWEEN 1 AND 120),
  provider_credential_id text,
  scope jsonb NOT NULL CHECK (octet_length(scope::text)<=32000),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 160),
  request_hash char(64) NOT NULL,
  status text NOT NULL CHECK (status IN ('creating','saved','verified','outcome_unknown','revoked')),
  verified_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,build_request_id,request_key),
  FOREIGN KEY (tenant_id,build_request_id,owner_user_id)
    REFERENCES orqaly.solution_build_requests(tenant_id,id,owner_user_id),
  CHECK (status NOT IN ('saved','verified') OR provider_credential_id IS NOT NULL),
  CHECK ((status='revoked')=(revoked_at IS NOT NULL))
);
CREATE INDEX solution_connections_owner_idx
  ON orqaly.solution_connections(tenant_id,owner_user_id,build_request_id,requirement_id,created_at DESC);
CREATE UNIQUE INDEX solution_connections_requirement_idx
  ON orqaly.solution_connections(tenant_id,build_request_id,requirement_id) WHERE status<>'revoked';

CREATE FUNCTION orqaly.guard_solution_build_test() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.status<>'running' OR
     (NEW.tenant_id,NEW.build_request_id,NEW.id,NEW.owner_user_id,NEW.input_version,
      NEW.workflow_hash,NEW.candidate_fingerprint,NEW.test_artifact_hash,NEW.environment_id,
      NEW.request_key,NEW.request_hash,NEW.configuration,NEW.created_at) IS DISTINCT FROM
     (OLD.tenant_id,OLD.build_request_id,OLD.id,OLD.owner_user_id,OLD.input_version,
      OLD.workflow_hash,OLD.candidate_fingerprint,OLD.test_artifact_hash,OLD.environment_id,
      OLD.request_key,OLD.request_hash,OLD.configuration,OLD.created_at) THEN
    RAISE EXCEPTION 'solution_build_test_immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER solution_build_test_guard BEFORE UPDATE ON orqaly.solution_build_tests
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_build_test();

CREATE FUNCTION orqaly.guard_solution_connection() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF OLD.status='revoked' OR
     (NEW.tenant_id,NEW.build_request_id,NEW.id,NEW.owner_user_id,NEW.requirement_id,
      NEW.environment_id,NEW.credential_type,NEW.scope,NEW.request_key,NEW.request_hash,NEW.created_at)
       IS DISTINCT FROM
     (OLD.tenant_id,OLD.build_request_id,OLD.id,OLD.owner_user_id,OLD.requirement_id,
      OLD.environment_id,OLD.credential_type,OLD.scope,OLD.request_key,OLD.request_hash,OLD.created_at) OR
     (OLD.provider_credential_id IS NOT NULL AND
      NEW.provider_credential_id IS DISTINCT FROM OLD.provider_credential_id) THEN
    RAISE EXCEPTION 'solution_connection_binding_immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.status<>OLD.status AND NOT (
    (OLD.status='creating' AND NEW.status IN ('saved','outcome_unknown','revoked')) OR
    (OLD.status='saved' AND NEW.status IN ('verified','revoked')) OR
    (OLD.status IN ('verified','outcome_unknown') AND NEW.status='revoked')
  ) THEN
    RAISE EXCEPTION 'solution_connection_transition_denied' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER solution_connection_guard BEFORE UPDATE ON orqaly.solution_connections
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_connection();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['solution_build_tests','solution_connections'] LOOP
    EXECUTE format('ALTER TABLE orqaly.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE orqaly.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I ON orqaly.%I TO orqaly_api,orqaly_worker USING (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting(''orqaly.build_owner_user_id'',true)) WITH CHECK (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting(''orqaly.build_owner_user_id'',true))',table_name||'_scope',table_name);
    EXECUTE format('CREATE POLICY %I ON orqaly.%I USING (current_user=orqaly.rpc_owner_name()) WITH CHECK (current_user=orqaly.rpc_owner_name())',table_name||'_rpc_owner',table_name);
  END LOOP;
END $$;
GRANT SELECT,INSERT ON orqaly.solution_build_tests,orqaly.solution_connections TO orqaly_api,orqaly_worker;
GRANT UPDATE(status,evidence,completed_at) ON orqaly.solution_build_tests TO orqaly_api,orqaly_worker;
GRANT UPDATE(provider_credential_id,status,verified_at,revoked_at) ON orqaly.solution_connections TO orqaly_api;

ALTER TABLE orqaly.solution_invocations DROP CONSTRAINT solution_invocations_status_check;
ALTER TABLE orqaly.solution_invocations ADD CONSTRAINT solution_invocations_status_check
  CHECK (status IN ('running','succeeded','failed','outcome_unknown'));
ALTER TABLE orqaly.solution_invocations ADD COLUMN evidence jsonb CHECK (octet_length(evidence::text)<=128000);
GRANT UPDATE(evidence) ON orqaly.solution_invocations TO orqaly_api;

-- A user-authorized queued request or repair may schedule only a pure-runtime
-- test. Browser request lifetime does not own execution. Admission revalidates
-- the exact pending request, immutable fingerprint and expiry under this lease.
-- Claimed owner scopes originate here, never from model output or caller IDs.
CREATE FUNCTION orqaly.claim_native_workflow_retest(p_lease_token uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE claimed orqaly.solution_build_requests%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_worker','member') THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE='42501';
  END IF;
  IF p_lease_token IS NULL THEN RAISE EXCEPTION 'lease required' USING ERRCODE='22023'; END IF;
  WITH candidate AS (
    SELECT tenant_id,id FROM orqaly.solution_build_requests
    WHERE preparation_version=2 AND status='draft' AND (
      native_metadata->>'autoRetest'='true' OR
      (jsonb_typeof(native_metadata->'pendingTest')='object' AND
       native_metadata->'pendingTest'->>'kind'='user_request'))
      AND (native_test_lease_expires_at IS NULL OR native_test_lease_expires_at<=clock_timestamp())
    ORDER BY updated_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  ) UPDATE orqaly.solution_build_requests AS build SET native_test_lease_token=p_lease_token,
    native_test_lease_expires_at=clock_timestamp()+interval '5 minutes',
    row_version=build.row_version+1,updated_at=clock_timestamp()
    FROM candidate WHERE build.tenant_id=candidate.tenant_id AND build.id=candidate.id
    RETURNING build.* INTO claimed;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('tenantId',claimed.tenant_id,'userId',claimed.owner_user_id,
    'buildRequestId',claimed.id,'leaseToken',p_lease_token,'rowVersion',claimed.row_version,
    'workflowHash',claimed.workflow_hash);
END $$;
REVOKE ALL ON FUNCTION orqaly.claim_native_workflow_retest(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.claim_native_workflow_retest(uuid) TO orqaly_worker;

COMMIT;
