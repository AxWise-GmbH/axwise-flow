BEGIN;

ALTER TABLE orqaly.assistant_messages
  ADD COLUMN retry_of_turn_id uuid NULL,
  ADD CONSTRAINT assistant_messages_retry_lineage_check CHECK (
    retry_of_turn_id IS NULL OR (role = 'user' AND retry_of_turn_id <> turn_id)
  );

-- A failed attempt may have only one explicit child attempt. Retrying that child
-- after another terminal failure creates the next link in the immutable chain.
CREATE UNIQUE INDEX assistant_messages_retry_child_idx
  ON orqaly.assistant_messages (tenant_id, thread_id, retry_of_turn_id)
  WHERE retry_of_turn_id IS NOT NULL;

COMMIT;
