BEGIN;

ALTER TABLE orqaly.customer_solutions
  ADD CONSTRAINT customer_solutions_owner_identity UNIQUE (tenant_id, id, owner_user_id);

CREATE TABLE orqaly.solution_application_keys (
  tenant_id uuid NOT NULL,
  solution_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL CHECK (owner_user_id ~ '^user_[A-Za-z0-9]+$'),
  environment text NOT NULL CHECK (environment IN ('preview','production')),
  label text NOT NULL CHECK (length(label) BETWEEN 1 AND 80),
  token_hash char(64) NOT NULL CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  workflow_hash char(64) NOT NULL CHECK (workflow_hash ~ '^[a-f0-9]{64}$'),
  create_key text NOT NULL CHECK (length(create_key) BETWEEN 8 AND 160),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_used_at timestamptz,
  row_version integer NOT NULL DEFAULT 1 CHECK (row_version > 0),
  PRIMARY KEY (tenant_id,id),
  UNIQUE (tenant_id,solution_id,id),
  UNIQUE (tenant_id,solution_id,create_key),
  FOREIGN KEY (tenant_id,solution_id,owner_user_id)
    REFERENCES orqaly.customer_solutions(tenant_id,id,owner_user_id),
  CHECK (expires_at > created_at AND expires_at - created_at <= interval '2160 hours')
);
CREATE INDEX solution_application_keys_owner_idx
  ON orqaly.solution_application_keys(tenant_id,solution_id,owner_user_id,created_at DESC);

CREATE FUNCTION orqaly.guard_solution_application_key_update() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,orqaly AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['revoked_at','last_used_at','row_version']) IS DISTINCT FROM
     (to_jsonb(OLD)-ARRAY['revoked_at','last_used_at','row_version']) OR
     (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) OR
     (OLD.last_used_at IS NOT NULL AND (NEW.last_used_at IS NULL OR NEW.last_used_at<OLD.last_used_at)) OR
     NEW.row_version <> OLD.row_version + (CASE WHEN OLD.revoked_at IS NULL AND NEW.revoked_at IS NOT NULL THEN 1 ELSE 0 END)
  THEN RAISE EXCEPTION 'application key grant is immutable; revocation is one-way' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION orqaly.guard_solution_application_key_update() FROM PUBLIC;
CREATE TRIGGER solution_application_key_update_guard BEFORE UPDATE ON orqaly.solution_application_keys
  FOR EACH ROW EXECUTE FUNCTION orqaly.guard_solution_application_key_update();

CREATE TABLE orqaly.solution_application_usage (
  tenant_id uuid NOT NULL,
  solution_id uuid NOT NULL,
  minute_start timestamptz NOT NULL,
  minute_count integer NOT NULL CHECK (minute_count BETWEEN 0 AND 60),
  day_start timestamptz NOT NULL,
  day_count integer NOT NULL CHECK (day_count BETWEEN 0 AND 1000),
  PRIMARY KEY (tenant_id,solution_id),
  FOREIGN KEY (tenant_id,solution_id) REFERENCES orqaly.customer_solutions(tenant_id,id)
);

ALTER TABLE orqaly.solution_invocations
  ADD COLUMN application_key_id uuid,
  ADD COLUMN application_key_label text CHECK (length(application_key_label) BETWEEN 1 AND 80),
  ADD CONSTRAINT solution_invocations_application_key
    FOREIGN KEY (tenant_id,solution_id,application_key_id)
    REFERENCES orqaly.solution_application_keys(tenant_id,solution_id,id),
  ADD CONSTRAINT solution_invocations_application_actor
    CHECK ((application_key_id IS NULL AND application_key_label IS NULL) OR
      (application_key_id IS NOT NULL AND application_key_label IS NOT NULL AND mode='production'));
CREATE INDEX solution_invocations_application_key_idx
  ON orqaly.solution_invocations(tenant_id,solution_id,application_key_id,created_at DESC);
CREATE INDEX solution_invocations_running_idx
  ON orqaly.solution_invocations(tenant_id,solution_id) WHERE status='running';

ALTER TABLE orqaly.solution_application_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_application_keys FORCE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_application_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_application_usage FORCE ROW LEVEL SECURITY;
CREATE POLICY solution_application_keys_tenant ON orqaly.solution_application_keys TO orqaly_api
  USING (tenant_id=orqaly.current_tenant_id()) WITH CHECK (tenant_id=orqaly.current_tenant_id());
CREATE POLICY solution_application_usage_tenant ON orqaly.solution_application_usage TO orqaly_api
  USING (tenant_id=orqaly.current_tenant_id()) WITH CHECK (tenant_id=orqaly.current_tenant_id());
GRANT SELECT,INSERT ON orqaly.solution_application_keys,orqaly.solution_application_usage TO orqaly_api;
GRANT UPDATE (revoked_at,last_used_at,row_version) ON orqaly.solution_application_keys TO orqaly_api;
GRANT UPDATE (minute_start,minute_count,day_start,day_count) ON orqaly.solution_application_usage TO orqaly_api;
-- Machine authentication checks suspension without creating/resolving a Clerk
-- session. Existing tenant RLS still applies; no global directory is exposed.
GRANT SELECT (id,status) ON orqaly.tenants TO orqaly_api;

COMMIT;
