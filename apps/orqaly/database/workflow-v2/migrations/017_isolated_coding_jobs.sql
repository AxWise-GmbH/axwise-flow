BEGIN;
CREATE TABLE orqaly.solution_coding_jobs (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL,
  solution_id uuid NOT NULL,
  run_id uuid NOT NULL,
  spec jsonb NOT NULL CHECK (spec->>'kind'='node_source_patch_v1' AND octet_length(spec::text)<=1000000),
  spec_hash char(64) NOT NULL CHECK (spec_hash ~ '^[a-f0-9]{64}$'),
  request_key text NOT NULL CHECK (length(request_key) BETWEEN 8 AND 160),
  status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','queued','running','succeeded','failed','timed_out','cancelled','outcome_unknown')),
  approval_id uuid,
  approved_at timestamptz,
  execution_id uuid,
  execution_deadline timestamptz,
  evidence jsonb CHECK (octet_length(evidence::text)<=64000),
  artifacts jsonb CHECK (octet_length(artifacts::text)<=512000),
  row_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,owner_user_id,solution_id,request_key),
  FOREIGN KEY (tenant_id,solution_id,owner_user_id) REFERENCES orqaly.customer_solutions(tenant_id,id,owner_user_id),
  FOREIGN KEY (tenant_id,run_id) REFERENCES orqaly.workflow_runs(tenant_id,id),
  CHECK ((approval_id IS NULL)=(approved_at IS NULL)),
  CHECK (status IN ('proposed','cancelled') OR approval_id IS NOT NULL),
  CHECK (status NOT IN ('running','succeeded','failed','timed_out','outcome_unknown') OR execution_id IS NOT NULL)
);
CREATE INDEX solution_coding_jobs_owner_idx ON orqaly.solution_coding_jobs(tenant_id,owner_user_id,solution_id,created_at DESC);
CREATE UNIQUE INDEX solution_coding_jobs_running_idx ON orqaly.solution_coding_jobs(tenant_id,solution_id) WHERE status='running';
CREATE INDEX solution_coding_jobs_deadline_idx ON orqaly.solution_coding_jobs(execution_deadline) WHERE status='running';
CREATE INDEX solution_coding_jobs_run_idx ON orqaly.solution_coding_jobs(tenant_id,run_id);
CREATE INDEX solution_coding_jobs_queue_idx ON orqaly.solution_coding_jobs(created_at,id) WHERE status='queued';
ALTER TABLE orqaly.solution_coding_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_coding_jobs FORCE ROW LEVEL SECURITY;
CREATE POLICY solution_coding_jobs_scope ON orqaly.solution_coding_jobs TO orqaly_api,orqaly_worker
 USING (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting('orqaly.build_owner_user_id',true))
 WITH CHECK (tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
CREATE POLICY solution_coding_jobs_rpc_owner ON orqaly.solution_coding_jobs
 USING (current_user=orqaly.rpc_owner_name()) WITH CHECK (current_user=orqaly.rpc_owner_name());
CREATE FUNCTION orqaly.guard_solution_coding_job() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'proposed' OR NEW.row_version<>0 OR NEW.approval_id IS NOT NULL OR NEW.approved_at IS NOT NULL
      OR NEW.execution_id IS NOT NULL OR NEW.execution_deadline IS NOT NULL OR NEW.evidence IS NOT NULL OR NEW.artifacts IS NOT NULL THEN
      RAISE EXCEPTION 'coding_job_initial_state_required' USING ERRCODE='42501'; END IF;
    IF NOT EXISTS (SELECT 1 FROM orqaly.workflow_runs WHERE tenant_id=NEW.tenant_id AND id=NEW.run_id AND owner_user_id=NEW.owner_user_id) THEN
      RAISE EXCEPTION 'coding_job_run_owner_mismatch' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status='queued' AND NEW.status='running' AND
    (current_user<>orqaly.rpc_owner_name() OR NOT pg_has_role(session_user,'orqaly_worker','member')) THEN
    RAISE EXCEPTION 'coding_job_worker_claim_required' USING ERRCODE='42501'; END IF;
  IF (NEW.tenant_id,NEW.id,NEW.owner_user_id,NEW.solution_id,NEW.run_id,NEW.spec,NEW.spec_hash,NEW.request_key,NEW.created_at)
    IS DISTINCT FROM (OLD.tenant_id,OLD.id,OLD.owner_user_id,OLD.solution_id,OLD.run_id,OLD.spec,OLD.spec_hash,OLD.request_key,OLD.created_at)
    OR (OLD.approval_id IS NOT NULL AND (NEW.approval_id,NEW.approved_at) IS DISTINCT FROM (OLD.approval_id,OLD.approved_at))
    OR (OLD.execution_id IS NOT NULL AND (NEW.execution_id,NEW.execution_deadline) IS DISTINCT FROM (OLD.execution_id,OLD.execution_deadline))
    OR OLD.status IN ('succeeded','failed','timed_out','cancelled')
    OR NEW.row_version<>OLD.row_version+1 THEN
    RAISE EXCEPTION 'coding_job_immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status='outcome_unknown' THEN
    IF NEW.status<>'outcome_unknown' OR OLD.evidence#>>'{cleanup,status}'='removed'
      OR NEW.evidence IS DISTINCT FROM jsonb_set(OLD.evidence,'{cleanup}','{"status":"removed"}'::jsonb)
      OR NEW.artifacts IS DISTINCT FROM OLD.artifacts THEN
      RAISE EXCEPTION 'coding_unknown_cleanup_only' USING ERRCODE='42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NOT ((OLD.status='proposed' AND NEW.status IN ('approved','cancelled')) OR
    (OLD.status='approved' AND NEW.status IN ('queued','cancelled')) OR
    (OLD.status='queued' AND NEW.status IN ('running','cancelled')) OR
    (OLD.status='running' AND NEW.status IN ('succeeded','failed','timed_out','outcome_unknown'))) THEN
    RAISE EXCEPTION 'coding_job_transition_denied' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER solution_coding_job_guard BEFORE INSERT OR UPDATE ON orqaly.solution_coding_jobs FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_coding_job();
REVOKE ALL ON FUNCTION orqaly.guard_solution_coding_job() FROM PUBLIC;
GRANT SELECT,INSERT ON orqaly.solution_coding_jobs TO orqaly_api,orqaly_worker;
GRANT UPDATE(status,approval_id,approved_at,execution_id,execution_deadline,evidence,artifacts,row_version,updated_at) ON orqaly.solution_coding_jobs TO orqaly_api,orqaly_worker;

CREATE FUNCTION orqaly.claim_solution_coding_job(p_execution_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,orqaly AS $$
DECLARE claimed orqaly.solution_coding_jobs%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user,'orqaly_worker','member') OR p_execution_id IS NULL THEN
    RAISE EXCEPTION 'coding worker required' USING ERRCODE='42501';
  END IF;
  -- There is one dedicated capped supervisor. Serialize claims globally, not
  -- merely per tenant: neither a second caller nor a lost cleanup may overlap.
  IF NOT pg_try_advisory_xact_lock(781904237002017::bigint) THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM orqaly.solution_coding_jobs WHERE status='running' OR
    (status='outcome_unknown' AND COALESCE(evidence#>>'{cleanup,status}','pending')<>'removed')) THEN RETURN NULL; END IF;
  WITH candidate AS (
    SELECT job.tenant_id,job.id FROM orqaly.solution_coding_jobs job
    JOIN orqaly.tenants tenant ON tenant.id=job.tenant_id AND tenant.status='active'
    WHERE job.status='queued'
    ORDER BY job.created_at,job.id FOR UPDATE OF job SKIP LOCKED LIMIT 1
  ) UPDATE orqaly.solution_coding_jobs job SET status='running',execution_id=p_execution_id,
    execution_deadline=clock_timestamp()+make_interval(secs=>((job.spec->'limits'->>'timeoutMs')::integer/1000)+120),
    row_version=job.row_version+1,updated_at=clock_timestamp()
    FROM candidate WHERE job.tenant_id=candidate.tenant_id AND job.id=candidate.id RETURNING job.* INTO claimed;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('tenantId',claimed.tenant_id,'userId',claimed.owner_user_id,'solutionId',claimed.solution_id,
    'runId',claimed.run_id,'jobId',claimed.id,'executionId',claimed.execution_id);
END $$;
REVOKE ALL ON FUNCTION orqaly.claim_solution_coding_job(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.claim_solution_coding_job(uuid) TO orqaly_worker;

-- One immutable n8n launch intent per approved job. It contains only receipt
-- metadata/provider IDs, NEVER the dispatch capability or any credential.
CREATE TABLE orqaly.solution_coding_dispatches (
 tenant_id uuid NOT NULL, id uuid NOT NULL, owner_user_id text NOT NULL,
 solution_id uuid NOT NULL, run_id uuid NOT NULL, job_id uuid NOT NULL,
 request_key text NOT NULL CHECK(length(request_key) BETWEEN 8 AND 160),
 environment_id text NOT NULL,
 status text NOT NULL DEFAULT 'initiating' CHECK(status IN ('initiating','accepted','rejected','outcome_unknown')),
 credential_id text, evidence jsonb CHECK(octet_length(evidence::text)<=16000),
 row_version integer NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,job_id),
 FOREIGN KEY(tenant_id,job_id) REFERENCES orqaly.solution_coding_jobs(tenant_id,id),
 FOREIGN KEY(tenant_id,solution_id,owner_user_id) REFERENCES orqaly.customer_solutions(tenant_id,id,owner_user_id)
);
ALTER TABLE orqaly.solution_coding_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_coding_dispatches FORCE ROW LEVEL SECURITY;
CREATE POLICY solution_coding_dispatches_scope ON orqaly.solution_coding_dispatches TO orqaly_api,orqaly_worker
 USING(tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting('orqaly.build_owner_user_id',true))
 WITH CHECK(tenant_id=(SELECT orqaly.current_tenant_id()) AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
CREATE FUNCTION orqaly.guard_solution_coding_dispatch() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'initiating' OR NEW.row_version<>0 OR NEW.credential_id IS NOT NULL OR NEW.evidence IS NOT NULL THEN
    RAISE EXCEPTION 'coding_dispatch_initial_state_required' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM orqaly.solution_coding_jobs WHERE tenant_id=NEW.tenant_id AND id=NEW.job_id
    AND owner_user_id=NEW.owner_user_id AND solution_id=NEW.solution_id AND run_id=NEW.run_id AND status='approved') THEN
    RAISE EXCEPTION 'coding_dispatch_job_scope_mismatch' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF OLD.status NOT IN ('initiating','outcome_unknown') OR NEW.row_version<>OLD.row_version+1 OR
  (NEW.tenant_id,NEW.id,NEW.owner_user_id,NEW.solution_id,NEW.run_id,NEW.job_id,NEW.request_key,NEW.environment_id,NEW.created_at)
  IS DISTINCT FROM (OLD.tenant_id,OLD.id,OLD.owner_user_id,OLD.solution_id,OLD.run_id,OLD.job_id,OLD.request_key,OLD.environment_id,OLD.created_at)
  OR (OLD.credential_id IS NOT NULL AND NEW.credential_id IS DISTINCT FROM OLD.credential_id) THEN
  RAISE EXCEPTION 'coding_dispatch_immutable' USING ERRCODE='42501'; END IF;
 IF OLD.status='outcome_unknown' AND (NEW.status<>'outcome_unknown' OR
   NEW.evidence - 'workflowCleanup' - 'credentialCleanup' IS DISTINCT FROM OLD.evidence - 'workflowCleanup' - 'credentialCleanup' OR
   (NEW.evidence->>'workflowCleanup' IS DISTINCT FROM OLD.evidence->>'workflowCleanup' AND NEW.evidence->>'workflowCleanup'<>'removed') OR
   (NEW.evidence->>'credentialCleanup' IS DISTINCT FROM OLD.evidence->>'credentialCleanup' AND NEW.evidence->>'credentialCleanup'<>'removed')) THEN
   RAISE EXCEPTION 'coding_dispatch_cleanup_only' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER solution_coding_dispatch_guard BEFORE INSERT OR UPDATE ON orqaly.solution_coding_dispatches FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_coding_dispatch();
REVOKE ALL ON FUNCTION orqaly.guard_solution_coding_dispatch() FROM PUBLIC;
GRANT SELECT,INSERT ON orqaly.solution_coding_dispatches TO orqaly_api,orqaly_worker;
GRANT UPDATE(status,credential_id,evidence,row_version,updated_at) ON orqaly.solution_coding_dispatches TO orqaly_api,orqaly_worker;
COMMIT;
