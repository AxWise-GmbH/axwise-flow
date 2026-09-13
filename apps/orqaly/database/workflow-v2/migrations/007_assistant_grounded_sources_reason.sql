BEGIN;

-- Migration 006 made routing provenance immutable but predated the
-- grounded-sources auto-routing reason. Widen only the accepted reason-code
-- vocabulary; all role, intent, route, and policy-version invariants remain
-- unchanged, and historical message rows remain replayable as written.
ALTER TABLE orqaly.assistant_messages
  DROP CONSTRAINT assistant_messages_route_provenance_check,
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
        'assistant_direct', 'auto_direct', 'grounded_sources_requested'
      )
    )
  );

COMMIT;
