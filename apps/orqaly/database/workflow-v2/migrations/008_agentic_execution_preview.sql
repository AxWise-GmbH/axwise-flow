BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'orqaly_gateway') THEN
    CREATE ROLE orqaly_gateway NOLOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA orqaly TO orqaly_gateway;

CREATE TABLE orqaly.executable_actions (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  workflow_run_id uuid NOT NULL,
  owner_user_id text NOT NULL CHECK (owner_user_id ~ '^user_[A-Za-z0-9]+$'),
  agent_id uuid NOT NULL,
  agent_name text NOT NULL CHECK (length(agent_name) BETWEEN 1 AND 300),
  status text NOT NULL CHECK (status IN (
    'proposed', 'running', 'succeeded', 'failed', 'rejected', 'outcome_unknown'
  )),
  operation_key text NOT NULL CHECK (operation_key = 'operational_record_create_v1'),
  descriptor jsonb NOT NULL CHECK (jsonb_typeof(descriptor) = 'object'),
  executor_binding jsonb NOT NULL CHECK (jsonb_typeof(executor_binding) = 'object'),
  persona_version jsonb NOT NULL CHECK (jsonb_typeof(persona_version) = 'object'),
  plan_artifact_id uuid NOT NULL,
  plan_artifact_hash char(64) NOT NULL CHECK (plan_artifact_hash ~ '^[a-f0-9]{64}$'),
  plan_artifact_kind text NOT NULL DEFAULT 'plan' CHECK (plan_artifact_kind = 'plan'),
  task_input_hash char(64) NOT NULL CHECK (task_input_hash ~ '^[a-f0-9]{64}$'),
  canonical_input jsonb NOT NULL CHECK (jsonb_typeof(canonical_input) = 'object'),
  canonical_input_hash char(64) NOT NULL CHECK (canonical_input_hash ~ '^[a-f0-9]{64}$'),
  proposal_idempotency_key text NOT NULL CHECK (length(proposal_idempotency_key) BETWEEN 8 AND 200),
  proposal_hash char(64) NOT NULL CHECK (proposal_hash ~ '^[a-f0-9]{64}$'),
  action_intent jsonb NOT NULL CHECK (jsonb_typeof(action_intent) = 'object'),
  action_intent_hash char(64) NOT NULL CHECK (action_intent_hash ~ '^[a-f0-9]{64}$'),
  approval_subject jsonb NOT NULL CHECK (jsonb_typeof(approval_subject) = 'object'),
  approval_binding_hash char(64) NOT NULL CHECK (approval_binding_hash ~ '^[a-f0-9]{64}$'),
  approval_expires_at timestamptz NOT NULL,
  approval_decision text NULL CHECK (approval_decision IS NULL OR approval_decision IN ('approve', 'reject')),
  approval_decision_hash char(64) NULL CHECK (
    approval_decision_hash IS NULL OR approval_decision_hash ~ '^[a-f0-9]{64}$'
  ),
  approval_idempotency_key text NULL CHECK (
    approval_idempotency_key IS NULL OR length(approval_idempotency_key) BETWEEN 8 AND 200
  ),
  approval_reason text NULL CHECK (approval_reason IS NULL OR length(approval_reason) BETWEEN 1 AND 500),
  approved_by_user_id text NULL,
  decided_at timestamptz NULL,
  step_id uuid NOT NULL,
  effect_id uuid NOT NULL,
  target_reference text NOT NULL CHECK (length(target_reference) BETWEEN 1 AND 512),
  attempt_id uuid NULL,
  n8n_execution_reference text NULL CHECK (
    n8n_execution_reference IS NULL OR length(n8n_execution_reference) BETWEEN 1 AND 512
  ),
  dispatch_receipt jsonb NULL CHECK (
    dispatch_receipt IS NULL OR jsonb_typeof(dispatch_receipt) = 'object'
  ),
  receipt_hash char(64) NULL CHECK (receipt_hash IS NULL OR receipt_hash ~ '^[a-f0-9]{64}$'),
  error_code text NULL CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 200),
  sanitized_error text NULL CHECK (
    sanitized_error IS NULL OR length(sanitized_error) BETWEEN 1 AND 2000
  ),
  started_at timestamptz NULL,
  execution_deadline_at timestamptz NULL,
  terminal_at timestamptz NULL,
  row_version bigint NOT NULL DEFAULT 0 CHECK (row_version >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, workflow_run_id, proposal_idempotency_key),
  UNIQUE (tenant_id, effect_id),
  UNIQUE (tenant_id, attempt_id),
  FOREIGN KEY (tenant_id, workflow_run_id)
    REFERENCES orqaly.workflow_runs(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (
    tenant_id, workflow_run_id, plan_artifact_id, plan_artifact_hash, plan_artifact_kind
  ) REFERENCES orqaly.artifacts(tenant_id, run_id, id, content_hash, kind) ON DELETE RESTRICT,
  CHECK (approval_expires_at > created_at),
  CHECK (
    (approval_decision IS NULL AND approval_decision_hash IS NULL
      AND approval_idempotency_key IS NULL AND approved_by_user_id IS NULL AND decided_at IS NULL)
    OR
    (approval_decision IS NOT NULL AND approval_decision_hash IS NOT NULL
      AND approval_idempotency_key IS NOT NULL AND approved_by_user_id IS NOT NULL
      AND decided_at IS NOT NULL)
  ),
  CHECK (
    (attempt_id IS NULL AND started_at IS NULL AND execution_deadline_at IS NULL)
    OR
    (attempt_id IS NOT NULL AND started_at IS NOT NULL AND execution_deadline_at IS NOT NULL)
  ),
  CHECK (execution_deadline_at IS NULL OR execution_deadline_at > started_at),
  CHECK ((dispatch_receipt IS NULL) = (receipt_hash IS NULL)),
  CHECK (
    (status IN ('proposed', 'rejected') AND attempt_id IS NULL)
    OR (status IN ('running', 'succeeded', 'failed', 'outcome_unknown') AND attempt_id IS NOT NULL)
  ),
  CHECK ((terminal_at IS NOT NULL) = (status IN ('succeeded', 'failed', 'rejected', 'outcome_unknown')))
);

CREATE INDEX executable_actions_run_idx
  ON orqaly.executable_actions (tenant_id, workflow_run_id, created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION orqaly.guard_executable_action_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF ROW(
    NEW.tenant_id, NEW.id, NEW.workflow_run_id, NEW.owner_user_id,
    NEW.agent_id, NEW.agent_name, NEW.operation_key, NEW.descriptor,
    NEW.executor_binding, NEW.persona_version, NEW.plan_artifact_id,
    NEW.plan_artifact_hash, NEW.plan_artifact_kind, NEW.task_input_hash,
    NEW.canonical_input, NEW.canonical_input_hash, NEW.proposal_idempotency_key,
    NEW.proposal_hash, NEW.action_intent, NEW.action_intent_hash,
    NEW.approval_subject, NEW.approval_binding_hash, NEW.approval_expires_at,
    NEW.step_id, NEW.effect_id, NEW.target_reference, NEW.created_at
  ) IS DISTINCT FROM ROW(
    OLD.tenant_id, OLD.id, OLD.workflow_run_id, OLD.owner_user_id,
    OLD.agent_id, OLD.agent_name, OLD.operation_key, OLD.descriptor,
    OLD.executor_binding, OLD.persona_version, OLD.plan_artifact_id,
    OLD.plan_artifact_hash, OLD.plan_artifact_kind, OLD.task_input_hash,
    OLD.canonical_input, OLD.canonical_input_hash, OLD.proposal_idempotency_key,
    OLD.proposal_hash, OLD.action_intent, OLD.action_intent_hash,
    OLD.approval_subject, OLD.approval_binding_hash, OLD.approval_expires_at,
    OLD.step_id, OLD.effect_id, OLD.target_reference, OLD.created_at
  ) THEN
    RAISE EXCEPTION 'executable action authority is immutable' USING ERRCODE = '55000';
  END IF;

  IF NEW.row_version <> OLD.row_version + 1 THEN
    RAISE EXCEPTION 'executable action row version must advance exactly once'
      USING ERRCODE = '40001';
  END IF;

  IF NOT (
    (OLD.status = 'proposed' AND NEW.status IN ('running', 'rejected'))
    OR (OLD.status = 'running' AND NEW.status IN ('succeeded', 'failed', 'outcome_unknown'))
  ) THEN
    RAISE EXCEPTION 'invalid executable action state transition % -> %', OLD.status, NEW.status
      USING ERRCODE = '40001';
  END IF;

  IF OLD.status <> 'proposed' AND ROW(
    NEW.approval_decision, NEW.approval_decision_hash,
    NEW.approval_idempotency_key, NEW.approval_reason,
    NEW.approved_by_user_id, NEW.decided_at, NEW.attempt_id,
    NEW.started_at, NEW.execution_deadline_at
  ) IS DISTINCT FROM ROW(
    OLD.approval_decision, OLD.approval_decision_hash,
    OLD.approval_idempotency_key, OLD.approval_reason,
    OLD.approved_by_user_id, OLD.decided_at, OLD.attempt_id,
    OLD.started_at, OLD.execution_deadline_at
  ) THEN
    RAISE EXCEPTION 'executable action approval is immutable after decision'
      USING ERRCODE = '55000';
  END IF;

  IF NEW.status = 'succeeded' AND (NEW.dispatch_receipt IS NULL OR NEW.receipt_hash IS NULL) THEN
    RAISE EXCEPTION 'successful executable action requires a verified receipt'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION orqaly.guard_executable_action_update() FROM PUBLIC;

CREATE TRIGGER executable_actions_guard_update
BEFORE UPDATE ON orqaly.executable_actions
FOR EACH ROW EXECUTE FUNCTION orqaly.guard_executable_action_update();

CREATE TRIGGER executable_actions_touch_updated_at
BEFORE UPDATE ON orqaly.executable_actions
FOR EACH ROW EXECUTE FUNCTION orqaly.touch_updated_at();

CREATE TABLE orqaly.agentic_gateway_grants (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  action_id uuid NOT NULL,
  owner_user_id text NOT NULL,
  reference_hash char(64) NOT NULL CHECK (reference_hash ~ '^[a-f0-9]{64}$'),
  scope_hash char(64) NOT NULL CHECK (scope_hash ~ '^[a-f0-9]{64}$'),
  organization_id text NOT NULL CHECK (length(organization_id) BETWEEN 1 AND 512),
  workspace_id text NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 512),
  run_id uuid NOT NULL,
  step_id uuid NOT NULL,
  effect_id uuid NOT NULL,
  state text NOT NULL DEFAULT 'issued' CHECK (state IN ('issued', 'redeemed')),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (reference_hash),
  UNIQUE (tenant_id, action_id),
  FOREIGN KEY (tenant_id, action_id)
    REFERENCES orqaly.executable_actions(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, run_id)
    REFERENCES orqaly.workflow_runs(tenant_id, id) ON DELETE RESTRICT,
  CHECK (organization_id = tenant_id::text),
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '5 minutes'),
  CHECK ((state = 'issued' AND redeemed_at IS NULL) OR (state = 'redeemed' AND redeemed_at IS NOT NULL))
);

CREATE TABLE orqaly.agentic_operational_records (
  tenant_id uuid NOT NULL,
  record_id uuid PRIMARY KEY,
  organization_id text NOT NULL CHECK (length(organization_id) BETWEEN 1 AND 512),
  workspace_id text NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 512),
  owner_user_id text NOT NULL CHECK (length(owner_user_id) BETWEEN 1 AND 512),
  run_id uuid NOT NULL,
  step_id uuid NOT NULL,
  effect_id uuid NOT NULL UNIQUE,
  action_id uuid NOT NULL,
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 120),
  details text NULL CHECK (details IS NULL OR length(details) <= 2000),
  canonical_input_hash char(64) NOT NULL CHECK (canonical_input_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, record_id),
  UNIQUE (tenant_id, effect_id),
  UNIQUE (tenant_id, organization_id, workspace_id, effect_id),
  CHECK (organization_id = tenant_id::text)
);

CREATE TABLE orqaly.agentic_gateway_effects (
  tenant_id uuid NOT NULL,
  effect_id uuid PRIMARY KEY,
  organization_id text NOT NULL CHECK (length(organization_id) BETWEEN 1 AND 512),
  workspace_id text NOT NULL CHECK (length(workspace_id) BETWEEN 1 AND 512),
  run_id uuid NOT NULL,
  step_id uuid NOT NULL,
  action_id uuid NOT NULL,
  grant_id uuid NOT NULL,
  descriptor_key text NOT NULL CHECK (length(descriptor_key) BETWEEN 1 AND 200),
  descriptor_hash char(64) NOT NULL CHECK (descriptor_hash ~ '^[a-f0-9]{64}$'),
  canonical_input_hash char(64) NOT NULL CHECK (canonical_input_hash ~ '^[a-f0-9]{64}$'),
  idempotency_scope text NOT NULL CHECK (length(idempotency_scope) BETWEEN 1 AND 200),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 512),
  operational_record_id uuid NOT NULL,
  dispatch_receipt jsonb NOT NULL CHECK (jsonb_typeof(dispatch_receipt) = 'object'),
  receipt_hash char(64) NOT NULL CHECK (receipt_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (tenant_id, effect_id),
  UNIQUE (tenant_id, organization_id, workspace_id, idempotency_scope, idempotency_key),
  FOREIGN KEY (tenant_id, operational_record_id)
    REFERENCES orqaly.agentic_operational_records(tenant_id, record_id) ON DELETE RESTRICT,
  CHECK (organization_id = tenant_id::text)
);

CREATE TRIGGER agentic_operational_records_immutable
BEFORE UPDATE OR DELETE ON orqaly.agentic_operational_records
FOR EACH ROW EXECUTE FUNCTION orqaly.deny_immutable_mutation();

CREATE TRIGGER agentic_gateway_effects_immutable
BEFORE UPDATE OR DELETE ON orqaly.agentic_gateway_effects
FOR EACH ROW EXECUTE FUNCTION orqaly.deny_immutable_mutation();

ALTER TABLE orqaly.executable_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.executable_actions FORCE ROW LEVEL SECURITY;
ALTER TABLE orqaly.agentic_gateway_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.agentic_gateway_grants FORCE ROW LEVEL SECURITY;
ALTER TABLE orqaly.agentic_operational_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.agentic_operational_records FORCE ROW LEVEL SECURITY;
ALTER TABLE orqaly.agentic_gateway_effects ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.agentic_gateway_effects FORCE ROW LEVEL SECURITY;

CREATE POLICY executable_actions_tenant_policy ON orqaly.executable_actions
  TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());

CREATE POLICY executable_actions_rpc_owner_policy ON orqaly.executable_actions
  USING (current_user = orqaly.rpc_owner_name())
  WITH CHECK (current_user = orqaly.rpc_owner_name());

CREATE POLICY agentic_gateway_grants_tenant_policy ON orqaly.agentic_gateway_grants
  TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());

CREATE POLICY agentic_gateway_grants_rpc_owner_policy ON orqaly.agentic_gateway_grants
  USING (current_user = orqaly.rpc_owner_name())
  WITH CHECK (current_user = orqaly.rpc_owner_name());

CREATE POLICY agentic_operational_records_gateway_tenant_policy
  ON orqaly.agentic_operational_records
  TO orqaly_gateway
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());

CREATE POLICY agentic_operational_records_rpc_owner_policy
  ON orqaly.agentic_operational_records
  TO orqaly_bootstrap
  USING (current_user = orqaly.rpc_owner_name())
  WITH CHECK (current_user = orqaly.rpc_owner_name());

CREATE POLICY agentic_gateway_effects_gateway_tenant_policy
  ON orqaly.agentic_gateway_effects
  TO orqaly_gateway
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());

CREATE POLICY agentic_gateway_effects_rpc_owner_policy
  ON orqaly.agentic_gateway_effects
  TO orqaly_bootstrap
  USING (current_user = orqaly.rpc_owner_name())
  WITH CHECK (current_user = orqaly.rpc_owner_name());

GRANT SELECT, INSERT, UPDATE ON orqaly.executable_actions TO orqaly_api;
GRANT SELECT, INSERT ON orqaly.agentic_gateway_grants TO orqaly_api;

CREATE OR REPLACE FUNCTION orqaly.redeem_agentic_gateway_grant(
  p_reference_hash text,
  p_scope_hash text,
  p_organization_id text,
  p_workspace_id text,
  p_run_id uuid,
  p_step_id uuid,
  p_effect_id uuid,
  p_redeemed_at timestamptz
)
RETURNS TABLE(
  state text,
  grant_id uuid,
  tenant_id uuid,
  owner_user_id text,
  action_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  v_grant orqaly.agentic_gateway_grants%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_reference_hash IS NULL
     OR p_scope_hash IS NULL
     OR p_organization_id IS NULL
     OR p_workspace_id IS NULL
     OR p_run_id IS NULL
     OR p_step_id IS NULL
     OR p_effect_id IS NULL
     OR p_redeemed_at IS NULL
     OR p_reference_hash !~ '^[a-f0-9]{64}$'
     OR p_scope_hash !~ '^[a-f0-9]{64}$'
     OR abs(extract(epoch FROM (p_redeemed_at - v_now))) > 30 THEN
    RETURN;
  END IF;

  SELECT * INTO v_grant
  FROM orqaly.agentic_gateway_grants AS stored_grant
  WHERE stored_grant.reference_hash = p_reference_hash
  FOR UPDATE;

  IF NOT FOUND
     OR v_grant.scope_hash <> p_scope_hash
     OR v_grant.organization_id <> p_organization_id
     OR v_grant.workspace_id <> p_workspace_id
     OR v_grant.run_id <> p_run_id
     OR v_grant.step_id <> p_step_id
     OR v_grant.effect_id <> p_effect_id
     OR v_grant.issued_at > v_now
     OR v_grant.expires_at <= v_now THEN
    RETURN;
  END IF;

  IF v_grant.state = 'redeemed' THEN
    RETURN QUERY SELECT 'replayed'::text, v_grant.id, v_grant.tenant_id,
      v_grant.owner_user_id, v_grant.action_id;
    RETURN;
  END IF;

  UPDATE orqaly.agentic_gateway_grants AS stored_grant
  SET state = 'redeemed', redeemed_at = v_now
  WHERE stored_grant.tenant_id = v_grant.tenant_id AND stored_grant.id = v_grant.id;

  RETURN QUERY SELECT 'redeemed'::text, v_grant.id, v_grant.tenant_id,
    v_grant.owner_user_id, v_grant.action_id;
END
$$;

REVOKE ALL ON FUNCTION orqaly.redeem_agentic_gateway_grant(
  text, text, text, text, uuid, uuid, uuid, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION orqaly.redeem_agentic_gateway_grant(
  text, text, text, text, uuid, uuid, uuid, timestamptz
) TO orqaly_gateway;

GRANT SELECT, INSERT ON orqaly.agentic_operational_records TO orqaly_gateway;
GRANT SELECT, INSERT ON orqaly.agentic_gateway_effects TO orqaly_gateway;

COMMIT;
