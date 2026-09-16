BEGIN;

-- The original customer_solutions workflow remains immutable. A release is a
-- distinct approved snapshot; activation changes only this pointer.
ALTER TABLE orqaly.customer_solutions ADD COLUMN active_revision_id uuid;

CREATE TABLE orqaly.solution_revisions (
  tenant_id uuid NOT NULL,
  solution_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL CHECK (owner_user_id ~ '^user_[A-Za-z0-9]+$'),
  version integer NOT NULL CHECK (version >= 2),
  base_revision_id uuid,
  base_version integer NOT NULL CHECK (base_version >= 1),
  base_workflow jsonb NOT NULL,
  base_spec jsonb NOT NULL,
  workflow jsonb NOT NULL CHECK (octet_length(workflow::text) <= 512000),
  workflow_hash char(64) NOT NULL CHECK (workflow_hash ~ '^[a-f0-9]{64}$'),
  spec jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','reviewed','rejected','approved','deploying','deployment_unknown','ready','active','superseded'
  )),
  review jsonb,
  environment_id text,
  approved_workflow_hash char(64),
  approved_at timestamptz,
  deployment jsonb,
  tested_at timestamptz,
  last_error text,
  row_version integer NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,solution_id,id),
  UNIQUE (tenant_id,solution_id,version),
  FOREIGN KEY (tenant_id,solution_id) REFERENCES orqaly.customer_solutions(tenant_id,id),
  FOREIGN KEY (tenant_id,solution_id,base_revision_id)
    REFERENCES orqaly.solution_revisions(tenant_id,solution_id,id),
  CHECK (status IN ('draft','reviewed','rejected') OR (
    approved_at IS NOT NULL AND approved_workflow_hash IS NOT NULL AND approved_workflow_hash = workflow_hash AND
    environment_id IS NOT NULL AND spec IS NOT NULL AND review IS NOT NULL AND review->>'valid' IS NOT DISTINCT FROM 'true'
  ))
);
CREATE UNIQUE INDEX solution_revisions_one_editable_idx
  ON orqaly.solution_revisions(tenant_id,solution_id)
  WHERE status IN ('draft','reviewed');
CREATE INDEX solution_revisions_owner_idx
  ON orqaly.solution_revisions(tenant_id,owner_user_id,solution_id,version DESC);
CREATE INDEX solution_revisions_base_idx
  ON orqaly.solution_revisions(tenant_id,solution_id,base_revision_id);

ALTER TABLE orqaly.customer_solutions ADD CONSTRAINT customer_solutions_active_revision_fk
  FOREIGN KEY (tenant_id,id,active_revision_id)
  REFERENCES orqaly.solution_revisions(tenant_id,solution_id,id);
ALTER TABLE orqaly.solution_invocations ADD COLUMN revision_id uuid;
ALTER TABLE orqaly.solution_invocations ADD CONSTRAINT solution_invocations_revision_fk
  FOREIGN KEY (tenant_id,solution_id,revision_id)
  REFERENCES orqaly.solution_revisions(tenant_id,solution_id,id);
CREATE INDEX solution_invocations_revision_idx
  ON orqaly.solution_invocations(tenant_id,solution_id,revision_id,created_at DESC);

CREATE TABLE orqaly.solution_revision_events (
  tenant_id uuid NOT NULL,
  solution_id uuid NOT NULL,
  revision_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('created','saved','reviewed','approved','rejected','deploying','deployed','deployment_unknown','tested','activated')),
  workflow_hash char(64) NOT NULL,
  details jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,id),
  FOREIGN KEY (tenant_id,solution_id,revision_id)
    REFERENCES orqaly.solution_revisions(tenant_id,solution_id,id)
);
CREATE INDEX solution_revision_events_history_idx
  ON orqaly.solution_revision_events(tenant_id,solution_id,revision_id,created_at DESC);

CREATE FUNCTION orqaly.guard_solution_revision_snapshot() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF (NEW.tenant_id,NEW.solution_id,NEW.id,NEW.owner_user_id,NEW.version,
      NEW.base_revision_id,NEW.base_version,NEW.base_workflow,NEW.base_spec,NEW.created_at)
    IS DISTINCT FROM
     (OLD.tenant_id,OLD.solution_id,OLD.id,OLD.owner_user_id,OLD.version,
      OLD.base_revision_id,OLD.base_version,OLD.base_workflow,OLD.base_spec,OLD.created_at) THEN
    RAISE EXCEPTION 'solution_revision_identity_immutable' USING ERRCODE = '42501';
  END IF;
  IF NEW.row_version <> OLD.row_version + 1 THEN
    RAISE EXCEPTION 'solution_revision_version_required' USING ERRCODE = '40001';
  END IF;
  IF NEW.status <> OLD.status AND NOT (
    (OLD.status IN ('draft','reviewed') AND NEW.status IN ('draft','reviewed','approved','rejected')) OR
    (OLD.status IN ('approved','deployment_unknown') AND NEW.status='deploying') OR
    (OLD.status='deploying' AND NEW.status IN ('ready','deployment_unknown')) OR
    (OLD.status='ready' AND NEW.status='active') OR
    (OLD.status='active' AND NEW.status='superseded')
  ) THEN
    RAISE EXCEPTION 'solution_revision_transition_denied' USING ERRCODE = '42501';
  END IF;
  IF OLD.status NOT IN ('draft','reviewed') AND
    (NEW.workflow,NEW.workflow_hash,NEW.spec,NEW.review,NEW.approved_workflow_hash,
     NEW.approved_at,NEW.environment_id) IS DISTINCT FROM
    (OLD.workflow,OLD.workflow_hash,OLD.spec,OLD.review,OLD.approved_workflow_hash,
     OLD.approved_at,OLD.environment_id) THEN
    RAISE EXCEPTION 'solution_approved_snapshot_immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.deployment IS NOT NULL AND NEW.deployment IS DISTINCT FROM OLD.deployment THEN
    RAISE EXCEPTION 'solution_deployment_snapshot_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER solution_revision_snapshot_guard BEFORE UPDATE ON orqaly.solution_revisions
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_revision_snapshot();

ALTER TABLE orqaly.solution_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_revision_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_revision_events FORCE ROW LEVEL SECURITY;
CREATE POLICY solution_revisions_tenant ON orqaly.solution_revisions TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());
CREATE POLICY solution_revision_events_tenant ON orqaly.solution_revision_events TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());
GRANT SELECT, INSERT ON orqaly.solution_revisions,orqaly.solution_revision_events TO orqaly_api;
GRANT UPDATE (workflow,workflow_hash,spec,status,review,environment_id,approved_workflow_hash,
  approved_at,deployment,tested_at,last_error,row_version,updated_at)
  ON orqaly.solution_revisions TO orqaly_api;
GRANT UPDATE (active_revision_id) ON orqaly.customer_solutions TO orqaly_api;

COMMIT;
