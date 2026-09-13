BEGIN;

-- Keep every new field nullable so immutable messages written before this
-- migration remain byte-for-byte replayable. New user turns persist one
-- complete routing decision; completed assistant turns persist only model
-- identifiers actually reported by AxWise.
ALTER TABLE orqaly.assistant_messages
  ADD COLUMN requested_intent text NULL,
  ADD COLUMN resolved_route text NULL,
  ADD COLUMN route_policy_version text NULL,
  ADD COLUMN route_reason_code text NULL,
  ADD COLUMN model text NULL,
  ADD COLUMN model_version text NULL,
  ADD CONSTRAINT assistant_messages_route_provenance_check CHECK (
    (
      requested_intent IS NULL
      AND resolved_route IS NULL
      AND route_policy_version IS NULL
      AND route_reason_code IS NULL
    )
    OR (
      role = 'user'
      AND requested_intent IS NOT NULL
      AND resolved_route IS NOT NULL
      AND route_policy_version IS NOT NULL
      AND route_reason_code IS NOT NULL
      AND requested_intent IN ('assistant', 'research', 'goal', 'auto')
      AND resolved_route = route
      AND route_policy_version ~ '^[A-Za-z0-9._:-]{1,100}$'
      AND route_reason_code IN (
        'requested_goal', 'requested_research', 'active_goal_continue',
        'explicit_goal_start', 'contextual_follow_up', 'context_required',
        'verification_requested', 'durable_work', 'bounded_research',
        'assistant_direct', 'auto_direct'
      )
    )
  ),
  ADD CONSTRAINT assistant_messages_model_provenance_check CHECK (
    (model IS NULL AND model_version IS NULL)
    OR (
      role = 'assistant'
      AND (model IS NULL OR length(model) BETWEEN 1 AND 200)
      AND (model_version IS NULL OR length(model_version) BETWEEN 1 AND 200)
    )
  );

COMMIT;
