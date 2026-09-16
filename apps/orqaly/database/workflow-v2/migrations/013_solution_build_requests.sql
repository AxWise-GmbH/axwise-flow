BEGIN;

CREATE TABLE orqaly.solution_build_requests (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL CHECK (owner_user_id ~ '^user_[A-Za-z0-9]+$'),
  agent_id uuid NOT NULL,
  run_id uuid NOT NULL,
  instruction text NOT NULL CHECK (length(instruction) BETWEEN 1 AND 24000),
  source_snapshot jsonb NOT NULL CHECK (octet_length(source_snapshot::text) <= 128000),
  agent_snapshot jsonb NOT NULL CHECK (octet_length(agent_snapshot::text) <= 64000),
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  purpose text NOT NULL CHECK (length(purpose) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'preparing' CHECK (status IN
    ('preparing','needs_input','draft','reviewed','completed','unsupported','failed')),
  partial_fields jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(partial_fields)='array'),
  questions jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(questions)='array' AND jsonb_array_length(questions)<=8),
  answers jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(answers)='array' AND octet_length(answers::text)<=128000),
  workflow jsonb CHECK (octet_length(workflow::text)<=512000),
  workflow_hash char(64) CHECK (workflow_hash ~ '^[a-f0-9]{64}$'),
  spec jsonb,
  review jsonb,
  explanation text NOT NULL DEFAULT '' CHECK (length(explanation)<=2000),
  unsupported_capabilities jsonb NOT NULL DEFAULT '[]' CHECK (jsonb_typeof(unsupported_capabilities)='array'),
  solution_id uuid,
  create_key text NOT NULL CHECK (length(create_key) BETWEEN 8 AND 160),
  create_hash char(64) NOT NULL CHECK (create_hash ~ '^[a-f0-9]{64}$'),
  input_version integer NOT NULL DEFAULT 1 CHECK (input_version>=1),
  row_version integer NOT NULL DEFAULT 0 CHECK (row_version>=0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,id,owner_user_id),
  UNIQUE (tenant_id,owner_user_id,create_key),
  FOREIGN KEY (tenant_id,run_id) REFERENCES orqaly.workflow_runs(tenant_id,id),
  FOREIGN KEY (tenant_id,solution_id) REFERENCES orqaly.customer_solutions(tenant_id,id),
  CHECK ((workflow IS NULL)=(workflow_hash IS NULL)),
  CHECK (status NOT IN ('reviewed','completed') OR
    (spec IS NOT NULL AND workflow IS NOT NULL AND review->>'valid' IS NOT DISTINCT FROM 'true'
     AND review->>'workflowHash'=workflow_hash AND jsonb_array_length(questions)=0)),
  CHECK ((status='completed')=(solution_id IS NOT NULL))
);
CREATE INDEX solution_build_requests_run_idx ON orqaly.solution_build_requests(tenant_id,owner_user_id,run_id,created_at DESC);
CREATE INDEX solution_build_requests_agent_idx ON orqaly.solution_build_requests(tenant_id,owner_user_id,agent_id,created_at DESC);
CREATE INDEX solution_build_requests_solution_idx ON orqaly.solution_build_requests(tenant_id,solution_id) WHERE solution_id IS NOT NULL;

ALTER TABLE orqaly.customer_solutions ADD COLUMN build_request_id uuid;
ALTER TABLE orqaly.customer_solutions ADD CONSTRAINT customer_solutions_build_request_fk
  FOREIGN KEY (tenant_id,build_request_id) REFERENCES orqaly.solution_build_requests(tenant_id,id);
CREATE INDEX customer_solutions_build_request_idx ON orqaly.customer_solutions(tenant_id,build_request_id) WHERE build_request_id IS NOT NULL;

CREATE TABLE orqaly.solution_build_attempts (
  tenant_id uuid NOT NULL,
  build_request_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL,
  input_version integer NOT NULL CHECK (input_version>=1),
  operation_id uuid NOT NULL,
  input_hash char(64) NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  envelope jsonb NOT NULL CHECK (octet_length(envelope::text)<=256000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','completed','failed','superseded')),
  status_url text,
  result jsonb CHECK (octet_length(result::text)<=256000),
  next_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease_token uuid,
  lease_expires_at timestamptz,
  worker_id text,
  dispatch_count integer NOT NULL DEFAULT 0 CHECK (dispatch_count>=0),
  last_error text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,build_request_id,input_version),
  UNIQUE (operation_id),
  FOREIGN KEY (tenant_id,build_request_id,owner_user_id)
    REFERENCES orqaly.solution_build_requests(tenant_id,id,owner_user_id)
);
CREATE INDEX solution_build_attempts_pending_idx ON orqaly.solution_build_attempts(next_at,lease_expires_at,created_at)
  WHERE status IN ('pending','accepted');
CREATE INDEX solution_build_attempts_owner_idx ON orqaly.solution_build_attempts(tenant_id,owner_user_id,build_request_id,input_version DESC);

CREATE TABLE orqaly.solution_build_events (
  tenant_id uuid NOT NULL,
  build_request_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('created','answered','saved','reviewed','handed_off','design_completed','design_failed','design_superseded','retried')),
  input_version integer NOT NULL,
  request_key text,
  request_hash char(64),
  details jsonb NOT NULL DEFAULT '{}' CHECK (octet_length(details::text)<=640000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,build_request_id,owner_user_id)
    REFERENCES orqaly.solution_build_requests(tenant_id,id,owner_user_id)
);
CREATE UNIQUE INDEX solution_build_events_idempotency_idx
  ON orqaly.solution_build_events(tenant_id,build_request_id,kind,request_key) WHERE request_key IS NOT NULL;
CREATE INDEX solution_build_events_owner_idx
  ON orqaly.solution_build_events(tenant_id,owner_user_id,build_request_id,created_at DESC);

CREATE FUNCTION orqaly.guard_solution_build_request() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF (NEW.tenant_id,NEW.id,NEW.owner_user_id,NEW.agent_id,NEW.run_id,NEW.instruction,
      NEW.source_snapshot,NEW.agent_snapshot,NEW.create_key,NEW.create_hash,NEW.created_at)
    IS DISTINCT FROM
     (OLD.tenant_id,OLD.id,OLD.owner_user_id,OLD.agent_id,OLD.run_id,OLD.instruction,
      OLD.source_snapshot,OLD.agent_snapshot,OLD.create_key,OLD.create_hash,OLD.created_at) THEN
    RAISE EXCEPTION 'solution_build_source_immutable' USING ERRCODE='42501';
  END IF;
  IF NEW.row_version<>OLD.row_version+1 OR NEW.input_version NOT IN (OLD.input_version,OLD.input_version+1) THEN
    RAISE EXCEPTION 'solution_build_version_required' USING ERRCODE='40001';
  END IF;
  IF OLD.status='completed' THEN
    RAISE EXCEPTION 'solution_build_handoff_immutable' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER solution_build_request_guard BEFORE UPDATE ON orqaly.solution_build_requests
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_build_request();

CREATE FUNCTION orqaly.guard_solution_build_attempt() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF (NEW.tenant_id,NEW.id,NEW.build_request_id,NEW.owner_user_id,NEW.input_version,
      NEW.operation_id,NEW.input_hash,NEW.envelope,NEW.created_at)
    IS DISTINCT FROM
     (OLD.tenant_id,OLD.id,OLD.build_request_id,OLD.owner_user_id,OLD.input_version,
      OLD.operation_id,OLD.input_hash,OLD.envelope,OLD.created_at) THEN
    RAISE EXCEPTION 'solution_build_attempt_input_immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status IN ('completed','failed','superseded') THEN
    RAISE EXCEPTION 'solution_build_attempt_terminal' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER solution_build_attempt_guard BEFORE UPDATE ON orqaly.solution_build_attempts
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_build_attempt();

DO $$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY['solution_build_requests','solution_build_attempts','solution_build_events'] LOOP
    EXECUTE format('ALTER TABLE orqaly.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE orqaly.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY %I ON orqaly.%I TO orqaly_api,orqaly_worker USING (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting(''orqaly.build_owner_user_id'',true)) WITH CHECK (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting(''orqaly.build_owner_user_id'',true))',table_name||'_scope',table_name);
    EXECUTE format('CREATE POLICY %I ON orqaly.%I USING (current_user=orqaly.rpc_owner_name()) WITH CHECK (current_user=orqaly.rpc_owner_name())',table_name||'_rpc_owner',table_name);
  END LOOP;
END $$;
GRANT SELECT,INSERT ON orqaly.solution_build_requests,orqaly.solution_build_attempts,orqaly.solution_build_events TO orqaly_api,orqaly_worker;
GRANT UPDATE(name,purpose,status,partial_fields,questions,answers,workflow,workflow_hash,spec,review,
  explanation,unsupported_capabilities,solution_id,input_version,row_version,last_error,updated_at)
  ON orqaly.solution_build_requests TO orqaly_api,orqaly_worker;
GRANT UPDATE(status,status_url,result,next_at,lease_token,lease_expires_at,worker_id,dispatch_count,last_error,updated_at)
  ON orqaly.solution_build_attempts TO orqaly_api,orqaly_worker;

CREATE FUNCTION orqaly.claim_solution_build_attempt(p_worker_id text,p_lease_token uuid,p_lease_seconds integer DEFAULT 120)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE claimed orqaly.solution_build_attempts%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_worker','member') THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE='42501';
  END IF;
  IF p_worker_id IS NULL OR length(p_worker_id) NOT BETWEEN 1 AND 300 OR p_lease_token IS NULL
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 10 AND 3600 THEN
    RAISE EXCEPTION 'invalid lease request' USING ERRCODE='22023';
  END IF;
  WITH candidate AS (
    SELECT tenant_id,id FROM orqaly.solution_build_attempts
    WHERE status IN ('pending','accepted') AND next_at<=clock_timestamp()
      AND (lease_expires_at IS NULL OR lease_expires_at<=clock_timestamp())
    ORDER BY next_at,created_at,id FOR UPDATE SKIP LOCKED LIMIT 1
  )
  UPDATE orqaly.solution_build_attempts AS attempt SET lease_token=p_lease_token,
    lease_expires_at=clock_timestamp()+make_interval(secs=>p_lease_seconds),worker_id=p_worker_id,
    dispatch_count=attempt.dispatch_count+1,updated_at=clock_timestamp()
  FROM candidate WHERE attempt.tenant_id=candidate.tenant_id AND attempt.id=candidate.id
  RETURNING attempt.* INTO claimed;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('tenantId',claimed.tenant_id,'userId',claimed.owner_user_id,
    'buildRequestId',claimed.build_request_id,'attemptId',claimed.id,'leaseToken',p_lease_token);
END $$;
REVOKE ALL ON FUNCTION orqaly.claim_solution_build_attempt(text,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.claim_solution_build_attempt(text,uuid,integer) TO orqaly_worker;

COMMIT;
