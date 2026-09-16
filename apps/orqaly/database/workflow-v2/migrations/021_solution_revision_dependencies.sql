BEGIN;

-- The source and destination of a candidate fork are both owned by the exact
-- same customer. The append-only idempotency receipt survives lost responses.
ALTER TABLE orqaly.solution_revisions ADD CONSTRAINT solution_revisions_owner_identity
  UNIQUE (tenant_id,solution_id,id,owner_user_id);
ALTER TABLE orqaly.solution_revisions ADD CONSTRAINT solution_revisions_solution_owner
  FOREIGN KEY (tenant_id,solution_id,owner_user_id)
  REFERENCES orqaly.customer_solutions(tenant_id,id,owner_user_id);

CREATE TABLE orqaly.solution_revision_forks (
  tenant_id uuid NOT NULL,
  solution_id uuid NOT NULL,
  owner_user_id text NOT NULL,
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9_-]{8,160}$'),
  request_hash char(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  source_revision_id uuid NOT NULL,
  source_row_version integer NOT NULL CHECK (source_row_version >= 0),
  source_workflow_hash char(64) NOT NULL CHECK (source_workflow_hash ~ '^[a-f0-9]{64}$'),
  target_revision_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id,solution_id,idempotency_key),
  UNIQUE (tenant_id,solution_id,target_revision_id),
  FOREIGN KEY (tenant_id,solution_id,source_revision_id,owner_user_id)
    REFERENCES orqaly.solution_revisions(tenant_id,solution_id,id,owner_user_id),
  FOREIGN KEY (tenant_id,solution_id,target_revision_id,owner_user_id)
    REFERENCES orqaly.solution_revisions(tenant_id,solution_id,id,owner_user_id),
  CHECK (source_revision_id <> target_revision_id)
);
CREATE INDEX solution_revision_forks_source_idx
  ON orqaly.solution_revision_forks(tenant_id,solution_id,source_revision_id,owner_user_id);
ALTER TABLE orqaly.solution_revision_forks ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_revision_forks FORCE ROW LEVEL SECURITY;
CREATE POLICY solution_revision_forks_owner ON orqaly.solution_revision_forks TO orqaly_api
  USING (tenant_id=orqaly.current_tenant_id()
    AND owner_user_id=current_setting('orqaly.build_owner_user_id',true))
  WITH CHECK (tenant_id=orqaly.current_tenant_id()
    AND owner_user_id=current_setting('orqaly.build_owner_user_id',true));
GRANT SELECT,INSERT ON orqaly.solution_revision_forks TO orqaly_api;

COMMIT;
