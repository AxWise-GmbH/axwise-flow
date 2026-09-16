BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE SCHEMA IF NOT EXISTS orqaly;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orqaly_api') THEN
    CREATE ROLE orqaly_api NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orqaly_worker') THEN
    CREATE ROLE orqaly_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orqaly_identity') THEN
    CREATE ROLE orqaly_identity NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orqaly_bootstrap') THEN
    CREATE ROLE orqaly_bootstrap NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format('GRANT orqaly_bootstrap TO %I', current_user);
END
$$;

REVOKE ALL ON SCHEMA orqaly FROM PUBLIC;
GRANT USAGE ON SCHEMA orqaly TO orqaly_api, orqaly_worker, orqaly_identity, orqaly_bootstrap;

CREATE OR REPLACE FUNCTION orqaly.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(current_setting('orqaly.tenant_id', true), '')::uuid
$$;

-- All privileged RPCs remain owned by the migration administrator.  This
-- helper lets FORCE RLS distinguish that fixed owner from API/worker callers;
-- changing a custom setting or request parameter can never satisfy it.
CREATE OR REPLACE FUNCTION orqaly.rpc_owner_name()
RETURNS name
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT current_user
$$;
REVOKE ALL ON FUNCTION orqaly.rpc_owner_name() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.rpc_owner_name()
  TO orqaly_api, orqaly_worker, orqaly_identity, orqaly_bootstrap;

CREATE OR REPLACE FUNCTION orqaly.sha256_text(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
PARALLEL SAFE
AS $$
  SELECT encode(public.digest(convert_to(value, 'UTF8'), 'sha256'), 'hex')
$$;

CREATE OR REPLACE FUNCTION orqaly.deny_immutable_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION '% is immutable', TG_TABLE_NAME USING ERRCODE = '55000';
END
$$;

CREATE OR REPLACE FUNCTION orqaly.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  RETURN NEW;
END
$$;

CREATE TABLE orqaly.tenants (
  id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended')),
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE orqaly.tenant_identity_bindings (
  tenant_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'clerk' CHECK (provider = 'clerk'),
  environment text NOT NULL CHECK (environment IN ('preview', 'production')),
  subject_type text NOT NULL CHECK (subject_type IN ('organization', 'user')),
  subject_id text NOT NULL CHECK (
    (subject_type = 'organization' AND subject_id ~ '^org_[A-Za-z0-9]+$') OR
    (subject_type = 'user' AND subject_id ~ '^user_[A-Za-z0-9]+$')
  ),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, provider, environment, subject_type, subject_id),
  UNIQUE (provider, environment, subject_type, subject_id),
  FOREIGN KEY (tenant_id) REFERENCES orqaly.tenants(id) ON DELETE RESTRICT
);

CREATE TABLE orqaly.workflow_runs (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL CHECK (owner_user_id ~ '^user_[A-Za-z0-9]+$'),
  owner_organization_id text NULL CHECK (
    owner_organization_id IS NULL OR owner_organization_id ~ '^org_[A-Za-z0-9]+$'
  ),
  mode text NOT NULL CHECK (mode IN ('simple', 'advanced')),
  status text NOT NULL CHECK (status IN (
    'requested', 'running', 'awaiting_gate_1', 'awaiting_gate_2',
    'completed', 'completed_with_evidence_gaps', 'blocked', 'failed', 'cancelled'
  )),
  contract_version text NOT NULL CHECK (contract_version = 'orqaly.workflow.v2'),
  request_hash text NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  evidence_readiness text NULL CHECK (
    evidence_readiness IS NULL OR evidence_readiness IN ('ready', 'ready_with_gaps', 'blocked')
  ),
  final_artifact_id uuid NULL,
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES orqaly.tenants(id) ON DELETE RESTRICT
);

CREATE TABLE orqaly.workflow_stages (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  id uuid NOT NULL,
  stage_key text NOT NULL CHECK (stage_key ~ '^[a-z0-9][a-z0-9_-]{0,119}$'),
  kind text NOT NULL CHECK (kind IN (
    'compile_scope', 'gate_1', 'execute_research', 'planning',
    'gate_2', 'execution', 'evaluation', 'synthesis'
  )),
  status text NOT NULL CHECK (status IN (
    'pending', 'ready', 'queued', 'running', 'polling', 'awaiting_approval',
    'completed', 'completed_with_evidence_gaps', 'blocked', 'failed', 'cancelled'
  )),
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  input_hash text NULL CHECK (input_hash IS NULL OR input_hash ~ '^[a-f0-9]{64}$'),
  output_artifact_id uuid NULL,
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, run_id, id),
  UNIQUE (tenant_id, run_id, stage_key),
  UNIQUE (tenant_id, run_id, ordinal),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES orqaly.workflow_runs(tenant_id, id) ON DELETE RESTRICT
);

CREATE TABLE orqaly.workflow_stage_dependencies (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  depends_on_stage_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, run_id, stage_id, depends_on_stage_id),
  CHECK (stage_id <> depends_on_stage_id),
  FOREIGN KEY (tenant_id, run_id, stage_id)
    REFERENCES orqaly.workflow_stages(tenant_id, run_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, run_id, depends_on_stage_id)
    REFERENCES orqaly.workflow_stages(tenant_id, run_id, id) ON DELETE RESTRICT
);

CREATE TABLE orqaly.stage_attempts (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  id uuid NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL CHECK (status IN (
    'queued', 'running', 'polling', 'succeeded', 'failed', 'abandoned'
  )),
  activity_type text NOT NULL CHECK (activity_type IN (
    'axwise_operation', 'orqaly_plan', 'orqaly_execute',
    'orqaly_evaluate', 'promote_artifact'
  )),
  operation_id uuid NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  input_payload jsonb NOT NULL CHECK (jsonb_typeof(input_payload) = 'object'),
  input_canonical text NOT NULL,
  operation_status_url text NULL,
  error_class text NULL,
  lease_token uuid NULL,
  lease_owner text NULL,
  lease_expires_at timestamptz NULL,
  deployment_id text NULL,
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, run_id, stage_id, id),
  UNIQUE (tenant_id, stage_id, attempt_number),
  UNIQUE (tenant_id, operation_id),
  UNIQUE (tenant_id, run_id, stage_id, id, operation_id, input_hash),
  CHECK (input_payload = input_canonical::jsonb),
  CHECK (orqaly.sha256_text(input_canonical) = input_hash),
  CHECK (
    (lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL) OR
    (lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  FOREIGN KEY (tenant_id, run_id, stage_id)
    REFERENCES orqaly.workflow_stages(tenant_id, run_id, id) ON DELETE RESTRICT
);

CREATE TABLE orqaly.artifacts (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  id uuid NOT NULL,
  kind text NOT NULL CHECK (length(kind) BETWEEN 1 AND 120),
  content_type text NOT NULL CHECK (content_type IN ('application/json', 'text/markdown')),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  source_operation_id uuid NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  markdown text NULL,
  canonical_content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, run_id, id),
  UNIQUE (tenant_id, run_id, id, content_hash, input_hash),
  UNIQUE (tenant_id, run_id, id, content_hash, kind),
  UNIQUE (tenant_id, source_operation_id),
  CHECK (
    (content_type = 'application/json' AND markdown IS NULL) OR
    (content_type = 'text/markdown' AND markdown IS NOT NULL AND length(markdown) > 0)
  ),
  CHECK (canonical_content::jsonb = jsonb_build_object(
    'contentType', content_type, 'payload', payload, 'markdown', to_jsonb(markdown)
  )),
  CHECK (orqaly.sha256_text(canonical_content) = content_hash),
  CHECK (content_type <> 'text/markdown' OR payload ->> 'markdown' = markdown),
  FOREIGN KEY (
    tenant_id, run_id, stage_id, attempt_id, source_operation_id, input_hash
  ) REFERENCES orqaly.stage_attempts(
    tenant_id, run_id, stage_id, id, operation_id, input_hash
  ) ON DELETE RESTRICT
);

CREATE TABLE orqaly.artifact_lineage (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  artifact_id uuid NOT NULL,
  source_artifact_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, run_id, artifact_id, source_artifact_id),
  CHECK (artifact_id <> source_artifact_id),
  FOREIGN KEY (tenant_id, run_id, artifact_id)
    REFERENCES orqaly.artifacts(tenant_id, run_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, run_id, source_artifact_id)
    REFERENCES orqaly.artifacts(tenant_id, run_id, id) ON DELETE RESTRICT
);

ALTER TABLE orqaly.workflow_stages
  ADD CONSTRAINT workflow_stages_output_artifact_fk
  FOREIGN KEY (tenant_id, run_id, output_artifact_id)
  REFERENCES orqaly.artifacts(tenant_id, run_id, id)
  DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE orqaly.workflow_runs
  ADD CONSTRAINT workflow_runs_final_artifact_fk
  FOREIGN KEY (tenant_id, id, final_artifact_id)
  REFERENCES orqaly.artifacts(tenant_id, run_id, id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE orqaly.approvals (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  stage_id uuid NOT NULL,
  id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('scope', 'plan')),
  artifact_id uuid NOT NULL,
  artifact_hash text NOT NULL CHECK (artifact_hash ~ '^[a-f0-9]{64}$'),
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  decision_hash text NOT NULL CHECK (decision_hash ~ '^[a-f0-9]{64}$'),
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected')),
  decided_by text NOT NULL CHECK (decided_by ~ '^user_[A-Za-z0-9]+$'),
  decided_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, run_id, idempotency_key),
  FOREIGN KEY (tenant_id, run_id, stage_id)
    REFERENCES orqaly.workflow_stages(tenant_id, run_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, run_id, artifact_id, artifact_hash, input_hash)
    REFERENCES orqaly.artifacts(tenant_id, run_id, id, content_hash, input_hash) ON DELETE RESTRICT
);

CREATE TABLE orqaly.workflow_events (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  id uuid NOT NULL,
  stage_id uuid NULL,
  attempt_id uuid NULL,
  event_type text NOT NULL CHECK (length(event_type) BETWEEN 1 AND 200),
  event_hash text NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$'),
  event_payload jsonb NOT NULL CHECK (jsonb_typeof(event_payload) = 'object'),
  audit_type text NOT NULL CHECK (length(audit_type) BETWEEN 1 AND 200),
  audit_payload jsonb NOT NULL CHECK (jsonb_typeof(audit_payload) = 'object'),
  transition_receipt jsonb NOT NULL CHECK (jsonb_typeof(transition_receipt) = 'object'),
  occurred_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES orqaly.workflow_runs(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, run_id, stage_id)
    REFERENCES orqaly.workflow_stages(tenant_id, run_id, id) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY (tenant_id, run_id, stage_id, attempt_id)
    REFERENCES orqaly.stage_attempts(tenant_id, run_id, stage_id, id)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE orqaly.outbox_events (
  tenant_id uuid NOT NULL,
  run_id uuid NOT NULL,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 300),
  command_type text NOT NULL CHECK (command_type IN (
    'dispatch_activity', 'poll_activity', 'export_final_artifact'
  )),
  stage_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  input_hash text NOT NULL CHECK (input_hash ~ '^[a-f0-9]{64}$'),
  artifact_id uuid NULL,
  artifact_hash text NULL CHECK (artifact_hash IS NULL OR artifact_hash ~ '^[a-f0-9]{64}$'),
  artifact_kind text NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed')),
  available_at timestamptz NOT NULL,
  lease_token uuid NULL,
  lease_owner text NULL,
  lease_expires_at timestamptz NULL,
  delivery_count integer NOT NULL DEFAULT 0 CHECK (delivery_count >= 0),
  last_error_class text NULL CHECK (last_error_class IS NULL OR length(last_error_class) <= 200),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, idempotency_key),
  CHECK (
    (lease_token IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL) OR
    (lease_token IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL)
  ),
  CHECK (
    (command_type = 'export_final_artifact' AND artifact_id IS NOT NULL
      AND artifact_hash IS NOT NULL AND artifact_kind = 'final_markdown') OR
    (command_type <> 'export_final_artifact' AND artifact_id IS NULL
      AND artifact_hash IS NULL AND artifact_kind IS NULL)
  ),
  FOREIGN KEY (tenant_id, run_id, stage_id, attempt_id, operation_id, input_hash)
    REFERENCES orqaly.stage_attempts(
      tenant_id, run_id, stage_id, id, operation_id, input_hash
    ) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, run_id, artifact_id, artifact_hash, artifact_kind)
    REFERENCES orqaly.artifacts(tenant_id, run_id, id, content_hash, kind)
    DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE orqaly.tenant_agents (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
  capabilities text[] NOT NULL DEFAULT '{}'::text[],
  tool_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  quality_score numeric(6,5) NOT NULL DEFAULT 0 CHECK (quality_score BETWEEN 0 AND 1),
  cost_per_run_cents integer NOT NULL DEFAULT 0 CHECK (cost_per_run_cents >= 0),
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES orqaly.tenants(id) ON DELETE RESTRICT
);

CREATE INDEX workflow_runs_status_idx
  ON orqaly.workflow_runs (tenant_id, status, updated_at);
CREATE INDEX workflow_stages_run_idx
  ON orqaly.workflow_stages (tenant_id, run_id, ordinal);
CREATE INDEX stage_attempts_recovery_idx
  ON orqaly.stage_attempts (status, lease_expires_at)
  WHERE status IN ('running', 'polling');
CREATE INDEX artifacts_run_idx
  ON orqaly.artifacts (tenant_id, run_id, stage_id, created_at);
CREATE INDEX workflow_events_run_idx
  ON orqaly.workflow_events (tenant_id, run_id, occurred_at, id);
CREATE INDEX outbox_claim_idx
  ON orqaly.outbox_events (available_at, created_at)
  WHERE status = 'pending';
CREATE INDEX outbox_expired_lease_idx
  ON orqaly.outbox_events (lease_expires_at)
  WHERE status = 'processing';
CREATE INDEX tenant_agents_filter_idx
  ON orqaly.tenant_agents (tenant_id, status, quality_score DESC);
CREATE INDEX tenant_agents_capabilities_idx
  ON orqaly.tenant_agents USING gin (capabilities);

CREATE TRIGGER workflow_runs_touch_updated_at
BEFORE UPDATE ON orqaly.workflow_runs
FOR EACH ROW EXECUTE FUNCTION orqaly.touch_updated_at();
CREATE TRIGGER workflow_stages_touch_updated_at
BEFORE UPDATE ON orqaly.workflow_stages
FOR EACH ROW EXECUTE FUNCTION orqaly.touch_updated_at();
CREATE TRIGGER stage_attempts_touch_updated_at
BEFORE UPDATE ON orqaly.stage_attempts
FOR EACH ROW EXECUTE FUNCTION orqaly.touch_updated_at();
CREATE TRIGGER outbox_events_touch_updated_at
BEFORE UPDATE ON orqaly.outbox_events
FOR EACH ROW EXECUTE FUNCTION orqaly.touch_updated_at();
CREATE TRIGGER tenant_agents_touch_updated_at
BEFORE UPDATE ON orqaly.tenant_agents
FOR EACH ROW EXECUTE FUNCTION orqaly.touch_updated_at();

CREATE TRIGGER artifacts_immutable
BEFORE UPDATE OR DELETE ON orqaly.artifacts
FOR EACH ROW EXECUTE FUNCTION orqaly.deny_immutable_mutation();
CREATE TRIGGER artifact_lineage_immutable
BEFORE UPDATE OR DELETE ON orqaly.artifact_lineage
FOR EACH ROW EXECUTE FUNCTION orqaly.deny_immutable_mutation();
CREATE TRIGGER approvals_immutable
BEFORE UPDATE OR DELETE ON orqaly.approvals
FOR EACH ROW EXECUTE FUNCTION orqaly.deny_immutable_mutation();
CREATE TRIGGER workflow_events_immutable
BEFORE UPDATE OR DELETE ON orqaly.workflow_events
FOR EACH ROW EXECUTE FUNCTION orqaly.deny_immutable_mutation();

ALTER TABLE orqaly.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.tenants FORCE ROW LEVEL SECURITY;
CREATE POLICY tenants_tenant_isolation ON orqaly.tenants
  TO orqaly_api, orqaly_worker
  USING (id = orqaly.current_tenant_id())
  WITH CHECK (id = orqaly.current_tenant_id());
CREATE POLICY tenants_rpc_owner_access ON orqaly.tenants
  USING (current_user = orqaly.rpc_owner_name())
  WITH CHECK (current_user = orqaly.rpc_owner_name());
CREATE POLICY tenants_bootstrap_select ON orqaly.tenants
  FOR SELECT TO orqaly_bootstrap
  USING (id = orqaly.current_tenant_id());
CREATE POLICY tenants_bootstrap_insert ON orqaly.tenants
  FOR INSERT TO orqaly_bootstrap
  WITH CHECK (id = orqaly.current_tenant_id());

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'tenant_identity_bindings', 'workflow_runs', 'workflow_stages',
    'workflow_stage_dependencies', 'stage_attempts', 'artifacts',
    'artifact_lineage', 'approvals', 'workflow_events', 'outbox_events', 'tenant_agents'
  ]
  LOOP
    EXECUTE format('ALTER TABLE orqaly.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE orqaly.%I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY %I ON orqaly.%I TO orqaly_api, orqaly_worker USING (tenant_id = orqaly.current_tenant_id()) WITH CHECK (tenant_id = orqaly.current_tenant_id())',
      table_name || '_tenant_isolation',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY %I ON orqaly.%I USING (current_user = orqaly.rpc_owner_name()) WITH CHECK (current_user = orqaly.rpc_owner_name())',
      table_name || '_rpc_owner_access',
      table_name
    );
  END LOOP;
END
$$;

-- Bootstrap is an intentionally non-login, one-time administration boundary.
-- It can only seed the three minimum catalogue/identity rows for the tenant
-- named by the transaction-local tenant setting. It has no workflow-table,
-- UPDATE, DELETE, function-owner or persistent credential capability.
CREATE POLICY tenant_identity_bindings_bootstrap_select
  ON orqaly.tenant_identity_bindings FOR SELECT TO orqaly_bootstrap
  USING (tenant_id = orqaly.current_tenant_id());
CREATE POLICY tenant_identity_bindings_bootstrap_insert
  ON orqaly.tenant_identity_bindings FOR INSERT TO orqaly_bootstrap
  WITH CHECK (tenant_id = orqaly.current_tenant_id());
CREATE POLICY tenant_agents_bootstrap_select
  ON orqaly.tenant_agents FOR SELECT TO orqaly_bootstrap
  USING (tenant_id = orqaly.current_tenant_id());
CREATE POLICY tenant_agents_bootstrap_insert
  ON orqaly.tenant_agents FOR INSERT TO orqaly_bootstrap
  WITH CHECK (tenant_id = orqaly.current_tenant_id());

GRANT SELECT ON
  orqaly.workflow_runs,
  orqaly.workflow_stages,
  orqaly.workflow_stage_dependencies,
  orqaly.stage_attempts,
  orqaly.tenant_agents,
  orqaly.artifacts,
  orqaly.artifact_lineage,
  orqaly.approvals,
  orqaly.workflow_events
TO orqaly_api, orqaly_worker;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA orqaly
  FROM orqaly_api, orqaly_worker, orqaly_identity, orqaly_bootstrap;

GRANT SELECT, INSERT ON
  orqaly.tenants,
  orqaly.tenant_identity_bindings,
  orqaly.tenant_agents
TO orqaly_bootstrap;

CREATE OR REPLACE FUNCTION orqaly.resolve_tenant_identity(
  p_environment text,
  p_user_id text,
  p_organization_id text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  resolved uuid;
BEGIN
  IF p_environment NOT IN ('preview', 'production') THEN
    RAISE EXCEPTION 'invalid environment' USING ERRCODE = '22023';
  END IF;
  IF p_user_id !~ '^user_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'invalid Clerk user id' USING ERRCODE = '22023';
  END IF;
  IF p_organization_id IS NOT NULL AND p_organization_id !~ '^org_[A-Za-z0-9]+$' THEN
    RAISE EXCEPTION 'invalid Clerk organization id' USING ERRCODE = '22023';
  END IF;

  SELECT binding.tenant_id
  INTO resolved
  FROM orqaly.tenant_identity_bindings AS binding
  JOIN orqaly.tenants AS tenant ON tenant.id = binding.tenant_id AND tenant.status = 'active'
  WHERE binding.provider = 'clerk'
    AND binding.environment = p_environment
    AND binding.subject_type = CASE WHEN p_organization_id IS NULL THEN 'user' ELSE 'organization' END
    AND binding.subject_id = COALESCE(p_organization_id, p_user_id);

  IF resolved IS NULL THEN
    RAISE EXCEPTION 'tenant identity is not bound' USING ERRCODE = '42501';
  END IF;
  RETURN resolved;
END
$$;

REVOKE ALL ON FUNCTION orqaly.resolve_tenant_identity(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.resolve_tenant_identity(text, text, text) TO orqaly_identity;

CREATE OR REPLACE FUNCTION orqaly.apply_transition(
  p_tenant_id uuid,
  p_run_id uuid,
  p_plan jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  event_payload jsonb := p_plan -> 'event';
  event_canonical text := p_plan ->> 'eventCanonical';
  event_id uuid := (p_plan -> 'event' ->> 'eventId')::uuid;
  event_type text := p_plan -> 'event' ->> 'type';
  event_hash text := p_plan ->> 'eventHash';
  event_occurred_at timestamptz := (p_plan -> 'event' ->> 'occurredAt')::timestamptz;
  item jsonb;
  patch jsonb;
  existing_hash text;
  existing_receipt jsonb;
  receipt jsonb;
  affected integer;
  source_id_text text;
  existing_outbox record;
BEGIN
  IF p_plan ->> 'contractVersion' <> 'orqaly.workflow.v2' THEN
    RAISE EXCEPTION 'unsupported transition contract' USING ERRCODE = '22023';
  END IF;
  IF orqaly.current_tenant_id() IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '42501';
  END IF;
  IF event_payload IS NULL OR jsonb_typeof(event_payload) <> 'object'
    OR event_canonical IS NULL OR event_hash IS NULL THEN
    RAISE EXCEPTION 'transition event canonical contract is missing'
      USING ERRCODE = '22023';
  END IF;
  BEGIN
    IF event_canonical::jsonb IS DISTINCT FROM event_payload THEN
      RAISE EXCEPTION 'canonical event bytes do not match event payload'
        USING ERRCODE = '22023';
    END IF;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'canonical event bytes are not valid JSON'
      USING ERRCODE = '22023';
  END;
  IF event_hash !~ '^[a-f0-9]{64}$'
    OR orqaly.sha256_text(event_canonical) <> event_hash THEN
    RAISE EXCEPTION 'event hash does not match canonical event bytes'
      USING ERRCODE = '22023';
  END IF;
  IF (event_payload ->> 'tenantId')::uuid <> p_tenant_id
    OR (event_payload ->> 'runId')::uuid <> p_run_id THEN
    RAISE EXCEPTION 'event tenant/run mismatch' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_tenant_id::text || ':' || event_id::text, 0));

  SELECT workflow_event.event_hash, workflow_event.transition_receipt
  INTO existing_hash, existing_receipt
  FROM orqaly.workflow_events AS workflow_event
  WHERE workflow_event.tenant_id = p_tenant_id AND workflow_event.id = event_id;

  IF FOUND THEN
    IF existing_hash <> event_hash THEN
      RAISE EXCEPTION 'event idempotency conflict' USING ERRCODE = '23505';
    END IF;
    RETURN existing_receipt || jsonb_build_object('idempotent', true);
  END IF;

  IF event_type = 'RunRequested' THEN
    INSERT INTO orqaly.workflow_runs (
      tenant_id, id, owner_user_id, owner_organization_id, mode, status,
      contract_version, request_hash, request_payload, row_version
    ) VALUES (
      p_tenant_id,
      p_run_id,
      event_payload ->> 'ownerUserId',
      event_payload ->> 'ownerOrganizationId',
      event_payload ->> 'mode',
      'requested',
      'orqaly.workflow.v2',
      event_payload ->> 'requestHash',
      jsonb_build_object('request', event_payload ->> 'request'),
      0
    ) ON CONFLICT (tenant_id, id) DO NOTHING;
  END IF;

  PERFORM 1
  FROM orqaly.workflow_runs AS run
  WHERE run.tenant_id = p_tenant_id AND run.id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow run not found' USING ERRCODE = 'P0002';
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'createStages', '[]'))
  LOOP
    INSERT INTO orqaly.workflow_stages (
      tenant_id, run_id, id, stage_key, kind, status, ordinal, input_hash
    ) VALUES (
      p_tenant_id, p_run_id, (item ->> 'id')::uuid, item ->> 'stageKey',
      item ->> 'kind', item ->> 'status', (item ->> 'ordinal')::integer,
      item ->> 'inputHash'
    );
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'createDependencies', '[]'))
  LOOP
    INSERT INTO orqaly.workflow_stage_dependencies (
      tenant_id, run_id, stage_id, depends_on_stage_id
    ) VALUES (
      p_tenant_id, p_run_id, (item ->> 'stageId')::uuid,
      (item ->> 'dependsOnStageId')::uuid
    );
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'createAttempts', '[]'))
  LOOP
    INSERT INTO orqaly.stage_attempts (
      tenant_id, run_id, stage_id, id, attempt_number, status,
      activity_type, operation_id, input_hash, input_payload, input_canonical
    ) VALUES (
      p_tenant_id, p_run_id, (item ->> 'stageId')::uuid, (item ->> 'id')::uuid,
      (item ->> 'attemptNumber')::integer, 'queued', item ->> 'activityType',
      (item ->> 'operationId')::uuid, item ->> 'inputHash',
      item -> 'inputPayload', item ->> 'inputCanonical'
    );
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'createArtifacts', '[]'))
  LOOP
    INSERT INTO orqaly.artifacts (
      tenant_id, run_id, stage_id, attempt_id, id, kind, content_type,
      content_hash, input_hash, source_operation_id, payload, markdown, canonical_content
    ) VALUES (
      p_tenant_id, p_run_id, (item ->> 'stageId')::uuid, (item ->> 'attemptId')::uuid,
      (item ->> 'artifactId')::uuid, item ->> 'kind', item ->> 'contentType',
      item ->> 'artifactHash', item ->> 'inputHash', (item ->> 'operationId')::uuid,
      COALESCE(item -> 'payload', '{}'::jsonb), item ->> 'markdown',
      item ->> 'canonicalContent'
    );

    FOR source_id_text IN
      SELECT jsonb_array_elements_text(COALESCE(item -> 'sourceArtifactIds', '[]'))
    LOOP
      INSERT INTO orqaly.artifact_lineage (
        tenant_id, run_id, artifact_id, source_artifact_id
      ) VALUES (
        p_tenant_id, p_run_id, (item ->> 'artifactId')::uuid, source_id_text::uuid
      );
    END LOOP;
  END LOOP;

  IF event_type IN (
    'ActivityDeferred', 'ActivityDispatchAmbiguous', 'ActivityRedispatchRequested',
    'ActivityCompleted', 'ActivityFailed'
  ) THEN
    UPDATE orqaly.outbox_events AS outbox
    SET status = 'completed', lease_token = NULL, lease_owner = NULL, lease_expires_at = NULL
    WHERE outbox.tenant_id = p_tenant_id
      AND outbox.run_id = p_run_id
      AND outbox.attempt_id = (event_payload ->> 'attemptId')::uuid
      AND outbox.status = 'processing'
      AND outbox.lease_token = (event_payload ->> 'leaseToken')::uuid;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
      RAISE EXCEPTION 'outbox acknowledgement lease conflict' USING ERRCODE = '40001';
    END IF;
  END IF;

  IF p_plan -> 'runMutation' IS NOT NULL AND p_plan -> 'runMutation' <> 'null'::jsonb THEN
    item := p_plan -> 'runMutation';
    patch := item -> 'patch';
    IF patch - ARRAY['status', 'evidence_readiness', 'final_artifact_id'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'run patch contains forbidden keys' USING ERRCODE = '22023';
    END IF;
    UPDATE orqaly.workflow_runs AS run
    SET status = CASE WHEN patch ? 'status' THEN patch ->> 'status' ELSE run.status END,
        evidence_readiness = CASE
          WHEN patch ? 'evidence_readiness' THEN patch ->> 'evidence_readiness'
          ELSE run.evidence_readiness
        END,
        final_artifact_id = CASE
          WHEN patch ? 'final_artifact_id' THEN (patch ->> 'final_artifact_id')::uuid
          ELSE run.final_artifact_id
        END,
        row_version = run.row_version + 1
    WHERE run.tenant_id = p_tenant_id
      AND run.id = (item ->> 'id')::uuid
      AND run.id = p_run_id
      AND run.row_version = (item ->> 'expectedVersion')::bigint;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
      RAISE EXCEPTION 'workflow run CAS conflict' USING ERRCODE = '40001';
    END IF;
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'stageMutations', '[]'))
  LOOP
    patch := item -> 'patch';
    IF patch - ARRAY['status', 'input_hash', 'output_artifact_id'] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'stage patch contains forbidden keys' USING ERRCODE = '22023';
    END IF;
    UPDATE orqaly.workflow_stages AS stage
    SET status = CASE WHEN patch ? 'status' THEN patch ->> 'status' ELSE stage.status END,
        input_hash = CASE WHEN patch ? 'input_hash' THEN patch ->> 'input_hash' ELSE stage.input_hash END,
        output_artifact_id = CASE
          WHEN patch ? 'output_artifact_id' THEN (patch ->> 'output_artifact_id')::uuid
          ELSE stage.output_artifact_id
        END,
        row_version = stage.row_version + 1
    WHERE stage.tenant_id = p_tenant_id
      AND stage.run_id = p_run_id
      AND stage.id = (item ->> 'id')::uuid
      AND stage.row_version = (item ->> 'expectedVersion')::bigint;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
      RAISE EXCEPTION 'workflow stage CAS conflict' USING ERRCODE = '40001';
    END IF;
  END LOOP;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'attemptMutations', '[]'))
  LOOP
    patch := item -> 'patch';
    IF patch - ARRAY[
      'status', 'error_class', 'operation_status_url', 'deployment_id', 'clear_lease'
    ] <> '{}'::jsonb THEN
      RAISE EXCEPTION 'attempt patch contains forbidden keys' USING ERRCODE = '22023';
    END IF;
    IF (item ->> 'id')::uuid <> (event_payload ->> 'attemptId')::uuid THEN
      RAISE EXCEPTION 'attempt mutation does not match event attempt' USING ERRCODE = '42501';
    END IF;
    UPDATE orqaly.stage_attempts AS attempt
    SET status = CASE WHEN patch ? 'status' THEN patch ->> 'status' ELSE attempt.status END,
        error_class = CASE
          WHEN patch ? 'error_class' THEN patch ->> 'error_class' ELSE attempt.error_class
        END,
        operation_status_url = CASE
          WHEN patch ? 'operation_status_url' THEN patch ->> 'operation_status_url'
          ELSE attempt.operation_status_url
        END,
        deployment_id = CASE
          WHEN patch ? 'deployment_id' THEN patch ->> 'deployment_id' ELSE attempt.deployment_id
        END,
        lease_token = CASE
          WHEN COALESCE((patch ->> 'clear_lease')::boolean, false) THEN NULL
          ELSE attempt.lease_token
        END,
        lease_owner = CASE
          WHEN COALESCE((patch ->> 'clear_lease')::boolean, false) THEN NULL
          ELSE attempt.lease_owner
        END,
        lease_expires_at = CASE
          WHEN COALESCE((patch ->> 'clear_lease')::boolean, false) THEN NULL
          ELSE attempt.lease_expires_at
        END,
        row_version = attempt.row_version + 1
    WHERE attempt.tenant_id = p_tenant_id
      AND attempt.run_id = p_run_id
      AND attempt.id = (item ->> 'id')::uuid
      AND attempt.row_version = (item ->> 'expectedVersion')::bigint
      AND attempt.lease_token = (event_payload ->> 'leaseToken')::uuid
      AND (
        (event_type = 'LeaseExpired' AND attempt.lease_expires_at <= clock_timestamp()) OR
        (event_type <> 'LeaseExpired' AND attempt.lease_expires_at > clock_timestamp())
      );
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN
      RAISE EXCEPTION 'attempt CAS or lease conflict' USING ERRCODE = '40001';
    END IF;
  END LOOP;

  IF p_plan -> 'createApproval' IS NOT NULL AND p_plan -> 'createApproval' <> 'null'::jsonb THEN
    item := p_plan -> 'createApproval';
    INSERT INTO orqaly.approvals (
      tenant_id, run_id, stage_id, id, kind, artifact_id, artifact_hash,
      input_hash, idempotency_key, decision_hash, decision, decided_by, decided_at
    ) VALUES (
      p_tenant_id, p_run_id, (item ->> 'stageId')::uuid, (item ->> 'id')::uuid,
      item ->> 'kind', (item -> 'artifact' ->> 'artifactId')::uuid,
      item -> 'artifact' ->> 'artifactHash', item ->> 'inputHash',
      item ->> 'idempotencyKey', item ->> 'decisionHash',
      'approved', item ->> 'decidedBy', event_occurred_at
    );
  END IF;

  FOR item IN SELECT value FROM jsonb_array_elements(COALESCE(p_plan -> 'outbox', '[]'))
  LOOP
    SELECT outbox.operation_id, outbox.input_hash, outbox.attempt_id, outbox.command_type,
           outbox.artifact_id, outbox.artifact_hash, outbox.artifact_kind
    INTO existing_outbox
    FROM orqaly.outbox_events AS outbox
    WHERE outbox.tenant_id = p_tenant_id
      AND outbox.idempotency_key = item ->> 'idempotencyKey';

    IF FOUND AND (
      existing_outbox.operation_id <> (item ->> 'operationId')::uuid OR
      existing_outbox.input_hash <> item ->> 'inputHash' OR
      existing_outbox.attempt_id <> (item ->> 'attemptId')::uuid OR
      existing_outbox.command_type <> item ->> 'commandType' OR
      existing_outbox.artifact_id IS DISTINCT FROM NULLIF(item -> 'artifact' ->> 'artifactId', '')::uuid OR
      existing_outbox.artifact_hash IS DISTINCT FROM item -> 'artifact' ->> 'artifactHash' OR
      existing_outbox.artifact_kind IS DISTINCT FROM item -> 'artifact' ->> 'kind'
    ) THEN
      RAISE EXCEPTION 'outbox idempotency conflict' USING ERRCODE = '23505';
    END IF;

    INSERT INTO orqaly.outbox_events (
      tenant_id, run_id, idempotency_key, command_type, stage_id,
      attempt_id, operation_id, input_hash, artifact_id, artifact_hash, artifact_kind,
      status, available_at
    ) VALUES (
      p_tenant_id, p_run_id, item ->> 'idempotencyKey', item ->> 'commandType',
      (item ->> 'stageId')::uuid, (item ->> 'attemptId')::uuid,
      (item ->> 'operationId')::uuid, item ->> 'inputHash',
      NULLIF(item -> 'artifact' ->> 'artifactId', '')::uuid,
      item -> 'artifact' ->> 'artifactHash', item -> 'artifact' ->> 'kind', 'pending',
      (item ->> 'availableAt')::timestamptz
    )
    ON CONFLICT (tenant_id, idempotency_key) DO UPDATE
    SET status = 'pending',
        available_at = EXCLUDED.available_at,
        lease_token = NULL,
        lease_owner = NULL,
        lease_expires_at = NULL;
  END LOOP;

  receipt := jsonb_build_object(
    'eventId', event_id,
    'runId', p_run_id,
    'tenantId', p_tenant_id,
    'planHash', orqaly.sha256_text(p_plan::text),
    'idempotent', false
  );

  INSERT INTO orqaly.workflow_events (
    tenant_id, run_id, id, stage_id, attempt_id, event_type, event_hash,
    event_payload, audit_type, audit_payload, transition_receipt, occurred_at
  ) VALUES (
    p_tenant_id,
    p_run_id,
    event_id,
    NULLIF(event_payload ->> 'stageId', '')::uuid,
    NULLIF(event_payload ->> 'attemptId', '')::uuid,
    event_type,
    event_hash,
    event_payload,
    p_plan -> 'audit' ->> 'eventType',
    p_plan -> 'audit' -> 'payload',
    receipt,
    event_occurred_at
  );

  RETURN receipt;
END
$$;

REVOKE ALL ON FUNCTION orqaly.apply_transition(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.apply_transition(uuid, uuid, jsonb)
  TO orqaly_api, orqaly_worker;

CREATE OR REPLACE FUNCTION orqaly.claim_outbox(
  p_worker_id text,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  claimed orqaly.outbox_events%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user, 'orqaly_worker', 'member') THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  IF length(p_worker_id) NOT BETWEEN 1 AND 300 OR p_lease_seconds NOT BETWEEN 10 AND 3600 THEN
    RAISE EXCEPTION 'invalid lease request' USING ERRCODE = '22023';
  END IF;

  WITH candidate AS (
    SELECT outbox.tenant_id, outbox.id
    FROM orqaly.outbox_events AS outbox
    JOIN orqaly.stage_attempts AS attempt
      ON attempt.tenant_id = outbox.tenant_id
     AND attempt.run_id = outbox.run_id
     AND attempt.stage_id = outbox.stage_id
     AND attempt.id = outbox.attempt_id
     AND attempt.operation_id = outbox.operation_id
     AND attempt.input_hash = outbox.input_hash
    WHERE outbox.command_type IN ('dispatch_activity', 'poll_activity')
      AND (
        (outbox.status = 'pending' AND outbox.available_at <= clock_timestamp()) OR
        (
          outbox.status = 'processing'
          AND outbox.lease_expires_at <= clock_timestamp()
          AND attempt.status = 'queued'
        )
      )
    ORDER BY outbox.available_at, outbox.created_at, outbox.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE orqaly.outbox_events AS outbox
  SET status = 'processing',
      lease_token = p_lease_token,
      lease_owner = p_worker_id,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      delivery_count = outbox.delivery_count + 1
  FROM candidate
  WHERE outbox.tenant_id = candidate.tenant_id AND outbox.id = candidate.id
  RETURNING outbox.* INTO claimed;

  IF claimed.id IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE orqaly.stage_attempts AS attempt
  SET lease_token = claimed.lease_token,
      lease_owner = claimed.lease_owner,
      lease_expires_at = claimed.lease_expires_at,
      row_version = attempt.row_version + 1
  WHERE attempt.tenant_id = claimed.tenant_id
    AND attempt.id = claimed.attempt_id
    AND (
      attempt.lease_token IS NULL OR
      attempt.lease_expires_at <= clock_timestamp() OR
      attempt.lease_token = claimed.lease_token
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'attempt lease conflict' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'tenantId', claimed.tenant_id,
    'runId', claimed.run_id,
    'outboxId', claimed.id,
    'commandType', claimed.command_type,
    'stageId', claimed.stage_id,
    'attemptId', claimed.attempt_id,
    'operationId', claimed.operation_id,
    'inputHash', claimed.input_hash,
    'leaseToken', claimed.lease_token,
    'leaseExpiresAt', claimed.lease_expires_at,
    'deliveryCount', claimed.delivery_count
  );
END
$$;

REVOKE ALL ON FUNCTION orqaly.claim_outbox(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.claim_outbox(text, uuid, integer) TO orqaly_worker;

CREATE OR REPLACE FUNCTION orqaly.claim_export_outbox(
  p_worker_id text,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 120
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  claimed orqaly.outbox_events%ROWTYPE;
BEGIN
  IF NOT pg_has_role(session_user, 'orqaly_worker', 'member') THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  IF length(p_worker_id) NOT BETWEEN 1 AND 300 OR p_lease_seconds NOT BETWEEN 10 AND 3600 THEN
    RAISE EXCEPTION 'invalid lease request' USING ERRCODE = '22023';
  END IF;

  WITH candidate AS (
    SELECT outbox.tenant_id, outbox.id
    FROM orqaly.outbox_events AS outbox
    WHERE outbox.command_type = 'export_final_artifact'
      AND (
        (outbox.status = 'pending' AND outbox.available_at <= clock_timestamp()) OR
        (outbox.status = 'processing' AND outbox.lease_expires_at <= clock_timestamp())
      )
    ORDER BY outbox.available_at, outbox.created_at, outbox.id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE orqaly.outbox_events AS outbox
  SET status = 'processing',
      lease_token = p_lease_token,
      lease_owner = p_worker_id,
      lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds),
      delivery_count = outbox.delivery_count + 1
  FROM candidate
  WHERE outbox.tenant_id = candidate.tenant_id AND outbox.id = candidate.id
  RETURNING outbox.* INTO claimed;

  IF claimed.id IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN jsonb_build_object(
    'tenantId', claimed.tenant_id,
    'runId', claimed.run_id,
    'outboxId', claimed.id,
    'commandType', claimed.command_type,
    'stageId', claimed.stage_id,
    'attemptId', claimed.attempt_id,
    'operationId', claimed.operation_id,
    'inputHash', claimed.input_hash,
    'artifact', jsonb_build_object(
      'artifactId', claimed.artifact_id,
      'artifactHash', claimed.artifact_hash,
      'kind', claimed.artifact_kind
    ),
    'leaseToken', claimed.lease_token,
    'leaseExpiresAt', claimed.lease_expires_at,
    'deliveryCount', claimed.delivery_count
  );
END
$$;

REVOKE ALL ON FUNCTION orqaly.claim_export_outbox(text, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.claim_export_outbox(text, uuid, integer) TO orqaly_worker;

CREATE OR REPLACE FUNCTION orqaly.ack_export_outbox(
  p_tenant_id uuid,
  p_outbox_id uuid,
  p_lease_token uuid,
  p_succeeded boolean,
  p_retry_at timestamptz DEFAULT NULL,
  p_error_class text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  affected integer;
BEGIN
  IF NOT pg_has_role(session_user, 'orqaly_worker', 'member') THEN
    RAISE EXCEPTION 'worker role required' USING ERRCODE = '42501';
  END IF;
  IF NOT p_succeeded AND p_retry_at IS NULL THEN
    RAISE EXCEPTION 'failed export requires retry time' USING ERRCODE = '22023';
  END IF;
  IF p_error_class IS NOT NULL AND length(p_error_class) > 200 THEN
    RAISE EXCEPTION 'invalid error class' USING ERRCODE = '22023';
  END IF;

  UPDATE orqaly.outbox_events AS outbox
  SET status = CASE WHEN p_succeeded THEN 'completed' ELSE 'pending' END,
      available_at = CASE WHEN p_succeeded THEN outbox.available_at ELSE p_retry_at END,
      lease_token = NULL,
      lease_owner = NULL,
      lease_expires_at = NULL,
      last_error_class = CASE WHEN p_succeeded THEN NULL ELSE p_error_class END
  WHERE outbox.tenant_id = p_tenant_id
    AND outbox.id = p_outbox_id
    AND outbox.command_type = 'export_final_artifact'
    AND outbox.status = 'processing'
    AND outbox.lease_token = p_lease_token
    AND outbox.lease_expires_at > clock_timestamp();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN
    RAISE EXCEPTION 'export acknowledgement lease conflict' USING ERRCODE = '40001';
  END IF;
  RETURN jsonb_build_object(
    'tenantId', p_tenant_id,
    'outboxId', p_outbox_id,
    'status', CASE WHEN p_succeeded THEN 'completed' ELSE 'pending' END
  );
END
$$;

REVOKE ALL ON FUNCTION orqaly.ack_export_outbox(
  uuid, uuid, uuid, boolean, timestamptz, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.ack_export_outbox(
  uuid, uuid, uuid, boolean, timestamptz, text
) TO orqaly_worker;

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
  IF p_limit NOT BETWEEN 1 AND 1000 THEN
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

CREATE OR REPLACE FUNCTION orqaly.list_tenant_agents(
  p_tenant_id uuid,
  p_required_capabilities text[] DEFAULT '{}'::text[],
  p_limit integer DEFAULT 100
)
RETURNS SETOF orqaly.tenant_agents
LANGUAGE plpgsql
SECURITY INVOKER
STABLE
SET search_path = pg_catalog, orqaly
AS $$
BEGIN
  IF orqaly.current_tenant_id() IS DISTINCT FROM p_tenant_id THEN
    RAISE EXCEPTION 'tenant context mismatch' USING ERRCODE = '42501';
  END IF;
  IF p_limit NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'invalid limit' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT agent.*
  FROM orqaly.tenant_agents AS agent
  WHERE agent.tenant_id = p_tenant_id
    AND agent.status = 'active'
    AND agent.capabilities @> p_required_capabilities
  ORDER BY agent.quality_score DESC, agent.cost_per_run_cents ASC, agent.id
  LIMIT p_limit;
END
$$;

REVOKE ALL ON FUNCTION orqaly.list_tenant_agents(uuid, text[], integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.list_tenant_agents(uuid, text[], integer)
  TO orqaly_api, orqaly_worker;

COMMIT;
