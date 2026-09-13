BEGIN;

CREATE TABLE orqaly.solution_failure_probes (
  tenant_id uuid NOT NULL,
  solution_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  owner_user_id text NOT NULL,
  id uuid NOT NULL,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,160}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  source_row_version integer NOT NULL CHECK (source_row_version >= 0),
  source_version integer NOT NULL CHECK (source_version >= 2),
  workflow_hash char(64) NOT NULL CHECK (workflow_hash ~ '^[a-f0-9]{64}$'),
  bundle_hash char(64) NOT NULL CHECK (bundle_hash ~ '^[a-f0-9]{64}$'),
  environment_id text NOT NULL,
  dependency_id text NOT NULL,
  source_snapshot jsonb NOT NULL CHECK (jsonb_typeof(source_snapshot)='object'
    AND octet_length(source_snapshot::text)<=512000),
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running','succeeded','failed','outcome_unknown')),
  evidence jsonb CHECK (jsonb_typeof(evidence)='object' AND octet_length(evidence::text)<=65536),
  error_code text CHECK (length(error_code)<=120),
  cleanup_state text NOT NULL DEFAULT 'pending' CHECK (cleanup_state IN ('pending','removed','unknown')),
  cleanup_evidence jsonb CHECK (jsonb_typeof(cleanup_evidence)='object'
    AND octet_length(cleanup_evidence::text)<=16384),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,solution_id,revision_id,idempotency_key),
  FOREIGN KEY (tenant_id,solution_id,revision_id,owner_user_id)
    REFERENCES orqaly.solution_revisions(tenant_id,solution_id,id,owner_user_id),
  CHECK ((status='running' AND completed_at IS NULL AND evidence IS NULL)
    OR (status<>'running' AND completed_at IS NOT NULL))
);
CREATE INDEX solution_failure_probes_history_idx
  ON orqaly.solution_failure_probes(tenant_id,solution_id,revision_id,owner_user_id,created_at DESC);
CREATE INDEX solution_failure_probes_quota_idx
  ON orqaly.solution_failure_probes(tenant_id,owner_user_id,created_at DESC);
CREATE UNIQUE INDEX solution_failure_probes_one_unresolved_idx
  ON orqaly.solution_failure_probes(tenant_id,owner_user_id)
  WHERE status IN ('running','outcome_unknown') AND cleanup_state<>'removed';

CREATE FUNCTION orqaly.guard_solution_failure_probe() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog AS $$
DECLARE selected orqaly.solution_revisions%ROWTYPE; assigned_environment text;
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.status<>'running' OR NEW.cleanup_state<>'pending' OR
      NEW.evidence IS NOT NULL OR NEW.error_code IS NOT NULL OR
      NEW.completed_at IS NOT NULL OR NEW.cleanup_evidence IS NOT NULL THEN
      RAISE EXCEPTION 'solution_failure_probe_initial_state_required' USING ERRCODE='42501';
    END IF;
    SELECT r.* INTO selected FROM orqaly.solution_revisions r
      WHERE r.tenant_id=NEW.tenant_id AND r.solution_id=NEW.solution_id
        AND r.id=NEW.revision_id AND r.owner_user_id=NEW.owner_user_id
      FOR SHARE;
    SELECT COALESCE(selected.environment_id,s.environment_id) INTO assigned_environment
      FROM orqaly.customer_solutions s JOIN orqaly.tenants t ON t.id=s.tenant_id
      WHERE s.tenant_id=NEW.tenant_id AND s.id=NEW.solution_id
        AND s.owner_user_id=NEW.owner_user_id AND t.status='active';
    IF selected.id IS NULL OR assigned_environment IS NULL OR
      selected.status IN ('deploying','deployment_unknown') OR
      NEW.source_row_version IS DISTINCT FROM selected.row_version OR
      NEW.source_version IS DISTINCT FROM selected.version OR
      NEW.workflow_hash IS DISTINCT FROM selected.workflow_hash OR
      NEW.environment_id IS DISTINCT FROM assigned_environment OR
      NEW.source_snapshot->'workflow' IS DISTINCT FROM selected.workflow OR
      NEW.source_snapshot->'spec' IS DISTINCT FROM COALESCE(selected.spec,selected.base_spec) OR
      NEW.source_snapshot->'sourceVersion' IS DISTINCT FROM to_jsonb(selected.version) OR
      NEW.source_snapshot->>'workflowHash' IS DISTINCT FROM NEW.workflow_hash OR
      NEW.source_snapshot->>'bundleHash' IS DISTINCT FROM NEW.bundle_hash OR
      NEW.source_snapshot->>'environmentId' IS DISTINCT FROM NEW.environment_id OR
      (NEW.source_snapshot-ARRAY['workflow','spec','sourceVersion','workflowHash','bundleHash','environmentId'])<>'{}'::jsonb OR
      jsonb_typeof(NEW.source_snapshot->'spec'->'ownedDependencies') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'solution_failure_probe_source_mismatch' USING ERRCODE='42501';
    END IF;
    IF jsonb_array_length(NEW.source_snapshot->'spec'->'ownedDependencies')<>1 OR
      NEW.source_snapshot->'spec'->'ownedDependencies'->0->>'id' IS DISTINCT FROM NEW.dependency_id THEN
      RAISE EXCEPTION 'solution_failure_probe_dependency_mismatch' USING ERRCODE='42501';
    END IF;
    -- Reconciliation age is server-authored, not a caller-selected early lease.
    NEW.created_at:=clock_timestamp();
    RETURN NEW;
  END IF;
  IF (to_jsonb(NEW)-ARRAY['status','evidence','error_code','completed_at','cleanup_state','cleanup_evidence']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['status','evidence','error_code','completed_at','cleanup_state','cleanup_evidence']) THEN
    RAISE EXCEPTION 'solution_failure_probe_identity_immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.status<>'running' AND
    (NEW.status,NEW.evidence,NEW.error_code,NEW.completed_at) IS DISTINCT FROM
    (OLD.status,OLD.evidence,OLD.error_code,OLD.completed_at) THEN
    RAISE EXCEPTION 'solution_failure_probe_terminal_immutable' USING ERRCODE='42501';
  END IF;
  IF OLD.cleanup_state='removed' OR
    (NEW.status='running' AND NEW.cleanup_state<>'removed') THEN
    RAISE EXCEPTION 'solution_failure_probe_cleanup_transition_denied' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION orqaly.guard_solution_failure_probe() FROM PUBLIC;
CREATE TRIGGER solution_failure_probe_guard BEFORE INSERT OR UPDATE ON orqaly.solution_failure_probes
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_failure_probe();
ALTER TABLE orqaly.solution_failure_probes ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_failure_probes FORCE ROW LEVEL SECURITY;
CREATE POLICY solution_failure_probes_owner ON orqaly.solution_failure_probes TO orqaly_api
  USING (tenant_id=orqaly.current_tenant_id()
    AND owner_user_id=current_setting('orqaly.build_owner_user_id',true))
  WITH CHECK (tenant_id=orqaly.current_tenant_id()
    AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
GRANT SELECT,INSERT ON orqaly.solution_failure_probes TO orqaly_api;
GRANT UPDATE(status,evidence,error_code,completed_at,cleanup_state,cleanup_evidence)
  ON orqaly.solution_failure_probes TO orqaly_api;

COMMIT;
