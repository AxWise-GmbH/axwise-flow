BEGIN;

CREATE TABLE orqaly.customer_solutions (
  tenant_id uuid NOT NULL REFERENCES orqaly.tenants(id),
  id uuid NOT NULL,
  owner_user_id text NOT NULL CHECK (owner_user_id ~ '^user_[A-Za-z0-9]+$'),
  agent_id uuid NOT NULL,
  name text NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
  purpose text NOT NULL CHECK (length(purpose) BETWEEN 1 AND 2000),
  spec jsonb NOT NULL CHECK (spec->>'kind' = 'webhook_transform_v1'),
  agent_snapshot jsonb NOT NULL,
  workflow jsonb NOT NULL,
  workflow_hash char(64) NOT NULL CHECK (workflow_hash ~ '^[a-f0-9]{64}$'),
  create_key text NOT NULL CHECK (length(create_key) BETWEEN 8 AND 160),
  create_hash char(64) NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'deploying', 'deployment_unknown', 'ready', 'active', 'paused'
  )),
  environment_id text UNIQUE,
  deployment jsonb,
  approved_at timestamptz,
  tested_at timestamptz,
  last_error text,
  row_version integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, owner_user_id, create_key)
);

CREATE INDEX customer_solutions_agent_idx
  ON orqaly.customer_solutions(tenant_id, owner_user_id, agent_id, created_at DESC);

CREATE TABLE orqaly.solution_invocations (
  tenant_id uuid NOT NULL,
  solution_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('test', 'production')),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 8 AND 160),
  request_hash char(64) NOT NULL,
  workflow_hash char(64) NOT NULL,
  input jsonb NOT NULL CHECK (octet_length(input::text) <= 20000),
  output jsonb,
  status text NOT NULL CHECK (status IN ('running', 'succeeded', 'outcome_unknown')),
  execution_id text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, solution_id, idempotency_key),
  FOREIGN KEY (tenant_id, solution_id)
    REFERENCES orqaly.customer_solutions(tenant_id, id)
);
CREATE INDEX solution_invocations_history_idx
  ON orqaly.solution_invocations(tenant_id, solution_id, created_at DESC);

ALTER TABLE orqaly.customer_solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.customer_solutions FORCE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.solution_invocations FORCE ROW LEVEL SECURITY;
CREATE POLICY customer_solutions_tenant ON orqaly.customer_solutions TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());
CREATE POLICY solution_invocations_tenant ON orqaly.solution_invocations TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());
GRANT SELECT, INSERT ON orqaly.customer_solutions TO orqaly_api;
GRANT UPDATE (status, environment_id, deployment, approved_at, tested_at, last_error,
  row_version, updated_at) ON orqaly.customer_solutions TO orqaly_api;
GRANT SELECT, INSERT ON orqaly.solution_invocations TO orqaly_api;
GRANT UPDATE (output, status, execution_id, error_code, completed_at)
  ON orqaly.solution_invocations TO orqaly_api;

COMMIT;
