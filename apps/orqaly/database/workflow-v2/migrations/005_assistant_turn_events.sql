BEGIN;

CREATE TABLE orqaly.assistant_turn_events (
  tenant_id uuid NOT NULL,
  thread_id uuid NOT NULL,
  id uuid NOT NULL,
  sequence bigint NOT NULL CHECK (sequence > 0),
  turn_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'routed', 'retry_created', 'submitted', 'running', 'completed', 'failed',
    'progress', 'tool_started', 'tool_completed', 'approval_requested',
    'input_requested', 'cancel_requested', 'cancelled'
  )),
  route text NOT NULL CHECK (route IN (
    'DIRECT_ANSWER', 'DISCOVER', 'AXWISE_ONE_SHOT',
    'PROPOSE_GOAL', 'START_GOAL', 'CONTINUE_GOAL'
  )),
  axwise_operation_id uuid NULL,
  retry_of_turn_id uuid NULL,
  task_id uuid NULL,
  attempt_id uuid NULL,
  event_payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (
    jsonb_typeof(event_payload) = 'object' AND octet_length(event_payload::text) <= 16384
  ),
  event_hash text NOT NULL CHECK (event_hash ~ '^[a-f0-9]{64}$'),
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (tenant_id, id),
  UNIQUE (tenant_id, thread_id, sequence),
  FOREIGN KEY (tenant_id, thread_id)
    REFERENCES orqaly.assistant_threads(tenant_id, id) ON DELETE RESTRICT
);

CREATE INDEX assistant_turn_events_cursor_idx
  ON orqaly.assistant_turn_events (tenant_id, thread_id, sequence);
CREATE INDEX assistant_turn_events_turn_idx
  ON orqaly.assistant_turn_events (tenant_id, thread_id, turn_id, sequence);

CREATE FUNCTION orqaly.assign_assistant_turn_event_sequence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, orqaly
AS $$
DECLARE
  expected_sequence bigint;
BEGIN
  -- Serialize event allocation on the owning thread. This makes the cursor
  -- gap-free and monotonic even when lifecycle callbacks arrive concurrently.
  PERFORM 1
  FROM orqaly.assistant_threads
  WHERE tenant_id = NEW.tenant_id AND id = NEW.thread_id
  FOR UPDATE;

  SELECT coalesce(max(sequence), 0) + 1
  INTO expected_sequence
  FROM orqaly.assistant_turn_events
  WHERE tenant_id = NEW.tenant_id AND thread_id = NEW.thread_id;

  IF NEW.sequence IS NULL THEN
    NEW.sequence := expected_sequence;
  ELSIF NEW.sequence <> expected_sequence THEN
    RAISE EXCEPTION 'assistant event sequence must be the next thread sequence'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION orqaly.assign_assistant_turn_event_sequence() FROM PUBLIC;

CREATE TRIGGER assistant_turn_events_assign_sequence
BEFORE INSERT ON orqaly.assistant_turn_events
FOR EACH ROW EXECUTE FUNCTION orqaly.assign_assistant_turn_event_sequence();
CREATE TRIGGER assistant_turn_events_immutable
BEFORE UPDATE OR DELETE ON orqaly.assistant_turn_events
FOR EACH ROW EXECUTE FUNCTION orqaly.deny_immutable_mutation();

ALTER TABLE orqaly.assistant_turn_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE orqaly.assistant_turn_events FORCE ROW LEVEL SECURITY;
CREATE POLICY assistant_turn_events_tenant_isolation ON orqaly.assistant_turn_events
  TO orqaly_api
  USING (tenant_id = orqaly.current_tenant_id())
  WITH CHECK (tenant_id = orqaly.current_tenant_id());
CREATE POLICY assistant_turn_events_rpc_owner_access ON orqaly.assistant_turn_events
  USING (current_user = orqaly.rpc_owner_name())
  WITH CHECK (current_user = orqaly.rpc_owner_name());

GRANT SELECT, INSERT ON orqaly.assistant_turn_events TO orqaly_api;
REVOKE UPDATE, DELETE, TRUNCATE ON orqaly.assistant_turn_events
  FROM orqaly_api, orqaly_worker, orqaly_identity, orqaly_bootstrap;

COMMIT;
