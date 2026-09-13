BEGIN;

CREATE TABLE orqaly.assistant_threads (
  tenant_id uuid NOT NULL,
  id uuid NOT NULL,
  owner_user_id text NOT NULL CHECK (owner_user_id ~ '^user_[A-Za-z0-9]+$'),
  owner_organization_id text NULL CHECK (
    owner_organization_id IS NULL OR owner_organization_id ~ '^org_[A-Za-z0-9]+$'
  ),
  title text NOT NULL CHECK (length(title) BETWEEN 1 AND 240),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  FOREIGN KEY (tenant_id) REFERENCES orqaly.tenants(id) ON DELETE RESTRICT
);

CREATE TABLE orqaly.assistant_messages (
  tenant_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  id uuid NOT NULL,
  turn_id uuid NOT NULL,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  route text NOT NULL CHECK (route IN (
    'DIRECT_ANSWER', 'DISCOVER', 'AXWISE_ONE_SHOT',
    'PROPOSE_GOAL', 'START_GOAL', 'CONTINUE_GOAL'
  )),
  parts jsonb NOT NULL CHECK (
    jsonb_typeof(parts) = 'array' AND jsonb_array_length(parts) BETWEEN 1 AND 100
  ),
  content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
  axwise_operation_id uuid NULL,
  workflow_run_id uuid NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, thread_id, turn_id, role),
  FOREIGN KEY (tenant_id, thread_id)
    REFERENCES orqaly.assistant_threads(tenant_id, id) ON DELETE RESTRICT,
  FOREIGN KEY (tenant_id, workflow_run_id)
    REFERENCES orqaly.workflow_runs(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX assistant_threads_owner_idx
  ON orqaly.assistant_threads (tenant_id, owner_user_id, updated_at DESC, id);
CREATE INDEX assistant_messages_thread_idx
  ON orqaly.assistant_messages (tenant_id, thread_id, created_at, id);
CREATE UNIQUE INDEX assistant_messages_axwise_operation_idx
  ON orqaly.assistant_messages (tenant_id, axwise_operation_id)
  WHERE role = 'user' AND axwise_operation_id IS NOT NULL;

CREATE TRIGGER assistant_threads_touch_updated_at
BEFORE UPDATE ON orqaly.assistant_threads
FOR EACH ROW EXECUTE FUNCTION orqaly.touch_updated_at();
CREATE TRIGGER assistant_messages_immutable
BEFORE UPDATE OR DELETE ON orqaly.assistant_messages
FOR EACH ROW EXECUTE FUNCTION orqaly.deny_immutable_mutation();

ALTER TABLE orqaly.assistant_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.assistant_threads FORCE ROW LEVEL SECURITY;
CREATE POLICY assistant_threads_tenant_isolation ON orqaly.assistant_threads
  TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());
CREATE POLICY assistant_threads_rpc_owner_access ON orqaly.assistant_threads
  USING (current_user = orqaly.rpc_owner_name())
  WITH CHECK (current_user = orqaly.rpc_owner_name());

ALTER TABLE orqaly.assistant_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.assistant_messages FORCE ROW LEVEL SECURITY;
CREATE POLICY assistant_messages_tenant_isolation ON orqaly.assistant_messages
  TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());
CREATE POLICY assistant_messages_rpc_owner_access ON orqaly.assistant_messages
  USING (current_user = orqaly.rpc_owner_name())
  WITH CHECK (current_user = orqaly.rpc_owner_name());

GRANT SELECT, INSERT ON orqaly.assistant_threads, orqaly.assistant_messages TO orqaly_api;
GRANT UPDATE (title, status, updated_at) ON orqaly.assistant_threads TO orqaly_api;
REVOKE DELETE, TRUNCATE ON orqaly.assistant_threads, orqaly.assistant_messages
  FROM orqaly_api, orqaly_worker, orqaly_identity, orqaly_bootstrap;
REVOKE UPDATE, DELETE, TRUNCATE ON orqaly.assistant_messages
  FROM orqaly_api, orqaly_worker, orqaly_identity, orqaly_bootstrap;

COMMIT;
