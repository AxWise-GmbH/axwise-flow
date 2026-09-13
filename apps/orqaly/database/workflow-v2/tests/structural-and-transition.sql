\set ON_ERROR_STOP on

SELECT set_config('test.tenant_a', :'tenant_a', false);
SELECT set_config('test.tenant_b', :'tenant_b', false);
SELECT set_config('test.agent_a', :'agent_a', false);
SELECT set_config('test.clerk_user_a', :'clerk_user_a', false);
SELECT set_config('test.clerk_user_b', :'clerk_user_b', false);

-- Seed only through the one-time NOLOGIN bootstrap boundary. The role is
-- deliberately scoped to INSERT/SELECT on these three tenant catalogue tables.
BEGIN;
SET LOCAL ROLE orqaly_bootstrap;
SELECT set_config('orqaly.tenant_id', :'tenant_a', true);
INSERT INTO orqaly.tenants (id, display_name)
VALUES (:'tenant_a'::uuid, 'Tenant A');
INSERT INTO orqaly.tenant_identity_bindings (
  tenant_id, environment, subject_type, subject_id
) VALUES
  (:'tenant_a'::uuid, 'preview', 'user', :'clerk_user_a');
INSERT INTO orqaly.tenant_agents (
  tenant_id, id, name, capabilities, tool_ids, quality_score, cost_per_run_cents
) VALUES (
  :'tenant_a'::uuid, :'agent_a'::uuid, 'Tenant A researcher',
  ARRAY['research']::text[], ARRAY[:'tool_a'::uuid], 0.25000, 100
);

SELECT set_config('orqaly.tenant_id', :'tenant_b', true);
INSERT INTO orqaly.tenants (id, display_name)
VALUES (:'tenant_b'::uuid, 'Tenant B');
INSERT INTO orqaly.tenant_identity_bindings (
  tenant_id, environment, subject_type, subject_id
) VALUES
  (:'tenant_b'::uuid, 'preview', 'user', :'clerk_user_b');
INSERT INTO orqaly.tenant_agents (
  tenant_id, id, name, capabilities, tool_ids, quality_score, cost_per_run_cents
) VALUES (
  :'tenant_b'::uuid, :'agent_b'::uuid, 'Tenant B high scorer',
  ARRAY['research']::text[], ARRAY[:'tool_b'::uuid], 1.00000, 1
);

DO $$
BEGIN
  BEGIN
    INSERT INTO orqaly.tenant_identity_bindings (
      tenant_id, environment, subject_type, subject_id
    ) VALUES (
      current_setting('test.tenant_b')::uuid,
      'production',
      'organization',
      'org_forbidden999'
    );
    RAISE EXCEPTION 'organization identity binding bypassed the personal-only constraint';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

DO $$
BEGIN
  IF has_table_privilege('orqaly_bootstrap', 'orqaly.workflow_runs', 'INSERT')
    OR has_table_privilege('orqaly_bootstrap', 'orqaly.tenants', 'UPDATE')
    OR has_table_privilege('orqaly_bootstrap', 'orqaly.tenant_agents', 'DELETE') THEN
    RAISE EXCEPTION 'bootstrap role has mutation authority beyond one-time inserts';
  END IF;
END
$$;
COMMIT;

DO $$
DECLARE
  missing_rls text[];
  missing_forced_rls text[];
  unsafe_fk text[];
BEGIN
  SELECT array_agg(format('%I.%I', namespace.nspname, class.relname))
  INTO missing_rls
  FROM pg_class AS class
  JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'orqaly'
    AND class.relkind = 'r'
    AND NOT class.relrowsecurity;
  IF missing_rls IS NOT NULL THEN
    RAISE EXCEPTION 'tables without RLS: %', missing_rls;
  END IF;

  SELECT array_agg(format('%I.%I', namespace.nspname, class.relname))
  INTO missing_forced_rls
  FROM pg_class AS class
  JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'orqaly'
    AND class.relkind = 'r'
    AND NOT class.relforcerowsecurity;
  IF missing_forced_rls IS NOT NULL THEN
    RAISE EXCEPTION 'tables without FORCE RLS: %', missing_forced_rls;
  END IF;

  SELECT array_agg(constraint_record.conname)
  INTO unsafe_fk
  FROM pg_constraint AS constraint_record
  JOIN pg_class AS class ON class.oid = constraint_record.conrelid
  JOIN pg_namespace AS namespace ON namespace.oid = class.relnamespace
  WHERE namespace.nspname = 'orqaly'
    AND constraint_record.contype = 'f'
    AND class.relname <> 'tenants'
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(constraint_record.conkey) AS key(attnum)
      JOIN pg_attribute AS attribute
        ON attribute.attrelid = constraint_record.conrelid
       AND attribute.attnum = key.attnum
      WHERE attribute.attname = 'tenant_id'
    );
  IF unsafe_fk IS NOT NULL THEN
    RAISE EXCEPTION 'foreign keys missing tenant_id: %', unsafe_fk;
  END IF;

  IF has_table_privilege('orqaly_api', 'orqaly.workflow_runs', 'INSERT')
    OR has_table_privilege('orqaly_worker', 'orqaly.stage_attempts', 'UPDATE')
    OR has_table_privilege('orqaly_worker', 'orqaly.outbox_events', 'SELECT')
    OR has_table_privilege('orqaly_identity', 'orqaly.tenants', 'SELECT')
    OR NOT has_function_privilege(
      'orqaly_identity', 'orqaly.ensure_personal_tenant(text,text)', 'EXECUTE'
    )
    OR NOT has_function_privilege(
      'orqaly_identity', 'orqaly.resolve_tenant_identity(text,text,text)', 'EXECUTE'
    )
    OR has_function_privilege(
      'orqaly_api', 'orqaly.ensure_personal_tenant(text,text)', 'EXECUTE'
    )
    OR has_function_privilege(
      'orqaly_worker', 'orqaly.resolve_tenant_identity(text,text,text)', 'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'service roles have direct workflow/outbox mutation or read authority';
  END IF;
END
$$;

-- Existing personal bindings remain stable and do not report themselves as
-- newly provisioned. Identity callers receive no direct table authority.
SET ROLE orqaly_identity;
DO $$
DECLARE
  resolved record;
BEGIN
  SELECT * INTO STRICT resolved
    FROM orqaly.ensure_personal_tenant(
      'preview', current_setting('test.clerk_user_a')
    );
  IF resolved.tenant_id <> current_setting('test.tenant_a')::uuid OR resolved.created THEN
    RAISE EXCEPTION 'tenant A personal binding was not resolved stably';
  END IF;
  IF orqaly.resolve_tenant_identity(
    'preview', current_setting('test.clerk_user_a'), NULL
  ) <> current_setting('test.tenant_a')::uuid THEN
    RAISE EXCEPTION 'temporary resolver compatibility did not adopt the personal tenant';
  END IF;
  BEGIN
    PERFORM orqaly.resolve_tenant_identity(
      'preview', current_setting('test.clerk_user_a'), 'org_forbidden999'
    );
    RAISE EXCEPTION 'temporary resolver compatibility accepted an organization';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  SELECT * INTO STRICT resolved
    FROM orqaly.ensure_personal_tenant(
      'preview', current_setting('test.clerk_user_b')
    );
  IF resolved.tenant_id <> current_setting('test.tenant_b')::uuid OR resolved.created THEN
    RAISE EXCEPTION 'tenant B personal binding was not resolved stably';
  END IF;

  BEGIN
    PERFORM orqaly.ensure_personal_tenant('preview', 'org_forbidden999');
    RAISE EXCEPTION 'organization id was accepted as a personal Clerk user';
  EXCEPTION WHEN invalid_parameter_value THEN
    NULL;
  END;
END
$$;
RESET ROLE;

-- Tenant filtering happens inside SQL before ordering and LIMIT. Tenant B's
-- higher score must never appear while tenant A is the current context.
SET ROLE orqaly_api;
SELECT set_config('orqaly.tenant_id', :'tenant_a', false);
SELECT set_config('test.assistant_thread', gen_random_uuid()::text, false);
SELECT set_config('test.assistant_turn', gen_random_uuid()::text, false);
SELECT set_config('test.assistant_user_message', gen_random_uuid()::text, false);
SELECT set_config('test.assistant_event', gen_random_uuid()::text, false);
INSERT INTO orqaly.assistant_threads (
  tenant_id, id, owner_user_id, title
) VALUES (
  current_setting('test.tenant_a')::uuid,
  current_setting('test.assistant_thread')::uuid,
  current_setting('test.clerk_user_a'),
  'Assistant tenant boundary test'
);
INSERT INTO orqaly.assistant_messages (
  tenant_id, thread_id, id, turn_id, role, route, parts, content_hash
) VALUES (
  current_setting('test.tenant_a')::uuid,
  current_setting('test.assistant_thread')::uuid,
  current_setting('test.assistant_user_message')::uuid,
  current_setting('test.assistant_turn')::uuid,
  'user', 'DIRECT_ANSWER',
  '[{"type":"text","markdown":"hello"}]'::jsonb,
  repeat('a', 64)
);
SELECT set_config('test.assistant_provenance_turn', gen_random_uuid()::text, false);
INSERT INTO orqaly.assistant_messages (
  tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
  requested_intent, resolved_route, route_policy_version, route_reason_code
) VALUES (
  current_setting('test.tenant_a')::uuid,
  current_setting('test.assistant_thread')::uuid,
  gen_random_uuid(),
  current_setting('test.assistant_provenance_turn')::uuid,
  'user', 'AXWISE_ONE_SHOT',
  '[{"type":"text","markdown":"verify current behavior"}]'::jsonb,
  repeat('6', 64),
  'auto', 'AXWISE_ONE_SHOT', 'orqaly.assistant-route-policy.v2',
  'grounded_sources_requested'
);
INSERT INTO orqaly.assistant_messages (
  tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
  model, model_version
) VALUES (
  current_setting('test.tenant_a')::uuid,
  current_setting('test.assistant_thread')::uuid,
  gen_random_uuid(),
  current_setting('test.assistant_provenance_turn')::uuid,
  'assistant', 'AXWISE_ONE_SHOT',
  '[{"type":"text","markdown":"verified"}]'::jsonb,
  repeat('7', 64),
  'models/gemini-3.8-flash', 'gemini-3.8-flash'
);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM orqaly.assistant_messages
    WHERE tenant_id = current_setting('test.tenant_a')::uuid
      AND thread_id = current_setting('test.assistant_thread')::uuid
      AND turn_id = current_setting('test.assistant_provenance_turn')::uuid
      AND role = 'user'
      AND requested_intent = 'auto'
      AND resolved_route = route
      AND route_policy_version = 'orqaly.assistant-route-policy.v2'
      AND route_reason_code = 'grounded_sources_requested'
  ) THEN
    RAISE EXCEPTION 'Assistant route provenance did not persist';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM orqaly.assistant_messages
    WHERE tenant_id = current_setting('test.tenant_a')::uuid
      AND thread_id = current_setting('test.assistant_thread')::uuid
      AND turn_id = current_setting('test.assistant_provenance_turn')::uuid
      AND role = 'assistant'
      AND model = 'models/gemini-3.8-flash'
      AND model_version = 'gemini-3.8-flash'
  ) THEN
    RAISE EXCEPTION 'Assistant model provenance did not persist';
  END IF;
  BEGIN
    INSERT INTO orqaly.assistant_messages (
      tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
      requested_intent, resolved_route, route_policy_version, route_reason_code
    ) VALUES (
      current_setting('test.tenant_a')::uuid,
      current_setting('test.assistant_thread')::uuid,
      gen_random_uuid(), gen_random_uuid(), 'user', 'DIRECT_ANSWER',
      '[{"type":"text","markdown":"unknown route reason"}]'::jsonb,
      repeat('5', 64), 'auto', 'DIRECT_ANSWER',
      'orqaly.assistant-route-policy.v2', 'unrecognized_reason'
    );
    RAISE EXCEPTION 'an unknown Assistant route reason was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  BEGIN
    INSERT INTO orqaly.assistant_messages (
      tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
      requested_intent
    ) VALUES (
      current_setting('test.tenant_a')::uuid,
      current_setting('test.assistant_thread')::uuid,
      gen_random_uuid(), gen_random_uuid(), 'user', 'DIRECT_ANSWER',
      '[{"type":"text","markdown":"partial provenance"}]'::jsonb,
      repeat('8', 64), 'auto'
    );
    RAISE EXCEPTION 'partial Assistant route provenance was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  BEGIN
    INSERT INTO orqaly.assistant_messages (
      tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
      model, model_version
    ) VALUES (
      current_setting('test.tenant_a')::uuid,
      current_setting('test.assistant_thread')::uuid,
      gen_random_uuid(), gen_random_uuid(), 'user', 'DIRECT_ANSWER',
      '[{"type":"text","markdown":"invalid model provenance"}]'::jsonb,
      repeat('9', 64), 'models/gemini-3.8-flash', 'gemini-3.8-flash'
    );
    RAISE EXCEPTION 'model provenance was accepted on an Assistant user row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;
INSERT INTO orqaly.assistant_turn_events (
  tenant_id, thread_id, id, turn_id, event_type, route, event_hash, occurred_at
) VALUES (
  current_setting('test.tenant_a')::uuid,
  current_setting('test.assistant_thread')::uuid,
  current_setting('test.assistant_event')::uuid,
  current_setting('test.assistant_turn')::uuid,
  'routed', 'DIRECT_ANSWER', repeat('e', 64), clock_timestamp()
);
INSERT INTO orqaly.assistant_turn_events (
  tenant_id, thread_id, id, turn_id, event_type, route, event_payload,
  event_hash, occurred_at
) VALUES (
  current_setting('test.tenant_a')::uuid,
  current_setting('test.assistant_thread')::uuid,
  gen_random_uuid(), current_setting('test.assistant_turn')::uuid,
  'tool_started', 'DIRECT_ANSWER', '{"tool":"grounded_search"}'::jsonb,
  repeat('f', 64), clock_timestamp()
);
DO $$
BEGIN
  IF (
    SELECT array_agg(sequence ORDER BY sequence)
    FROM orqaly.assistant_turn_events
    WHERE tenant_id = current_setting('test.tenant_a')::uuid
      AND thread_id = current_setting('test.assistant_thread')::uuid
  ) <> ARRAY[1::bigint, 2::bigint] THEN
    RAISE EXCEPTION 'Assistant lifecycle event sequence is not monotonic per thread';
  END IF;
  BEGIN
    INSERT INTO orqaly.assistant_turn_events (
      tenant_id, thread_id, id, sequence, turn_id, event_type, route,
      event_hash, occurred_at
    ) VALUES (
      current_setting('test.tenant_a')::uuid,
      current_setting('test.assistant_thread')::uuid,
      gen_random_uuid(), 99, current_setting('test.assistant_turn')::uuid,
      'progress', 'DIRECT_ANSWER', repeat('9', 64), clock_timestamp()
    );
    RAISE EXCEPTION 'a non-monotonic Assistant event sequence was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;
SELECT set_config('test.assistant_retry_turn', gen_random_uuid()::text, false);
INSERT INTO orqaly.assistant_messages (
  tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
  retry_of_turn_id
) VALUES (
  current_setting('test.tenant_a')::uuid,
  current_setting('test.assistant_thread')::uuid,
  gen_random_uuid(),
  current_setting('test.assistant_retry_turn')::uuid,
  'user', 'DIRECT_ANSWER',
  '[{"type":"text","markdown":"retry hello"}]'::jsonb,
  repeat('b', 64),
  current_setting('test.assistant_turn')::uuid
);
DO $$
BEGIN
  BEGIN
    INSERT INTO orqaly.assistant_messages (
      tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
      retry_of_turn_id
    ) VALUES (
      current_setting('test.tenant_a')::uuid,
      current_setting('test.assistant_thread')::uuid,
      gen_random_uuid(), gen_random_uuid(), 'user', 'DIRECT_ANSWER',
      '[{"type":"text","markdown":"duplicate retry"}]'::jsonb,
      repeat('c', 64), current_setting('test.assistant_turn')::uuid
    );
    RAISE EXCEPTION 'a second retry child was accepted for one Assistant turn';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;
  BEGIN
    INSERT INTO orqaly.assistant_messages (
      tenant_id, thread_id, id, turn_id, role, route, parts, content_hash,
      retry_of_turn_id
    ) VALUES (
      current_setting('test.tenant_a')::uuid,
      current_setting('test.assistant_thread')::uuid,
      gen_random_uuid(), gen_random_uuid(), 'assistant', 'DIRECT_ANSWER',
      '[{"type":"text","markdown":"invalid retry role"}]'::jsonb,
      repeat('d', 64), current_setting('test.assistant_turn')::uuid
    );
    RAISE EXCEPTION 'retry lineage was accepted on an Assistant response row';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;
DO $$
DECLARE
  selected_agent uuid;
BEGIN
  SELECT agent.id INTO selected_agent
  FROM orqaly.list_tenant_agents(
    current_setting('test.tenant_a')::uuid, ARRAY['research'], 1
  ) AS agent;
  IF selected_agent <> current_setting('test.agent_a')::uuid THEN
    RAISE EXCEPTION 'tenant filtering did not occur before ranking/limiting';
  END IF;
  IF EXISTS (
    SELECT 1 FROM orqaly.tenant_agents
    WHERE tenant_id = current_setting('test.tenant_b')::uuid
  ) THEN
    RAISE EXCEPTION 'tenant A read tenant B catalogue rows';
  END IF;
  BEGIN
    INSERT INTO orqaly.workflow_runs (
      tenant_id, id, owner_user_id, mode, status, contract_version,
      request_hash, request_payload
    ) VALUES (
      current_setting('test.tenant_a')::uuid, gen_random_uuid(),
      current_setting('test.clerk_user_a'),
      'simple', 'requested',
      'orqaly.workflow.v2', repeat('a', 64), '{"request":"forbidden"}'::jsonb
    );
    RAISE EXCEPTION 'API role performed direct workflow DML';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    UPDATE orqaly.assistant_messages
       SET parts = '[{"type":"text","markdown":"changed"}]'::jsonb
     WHERE tenant_id = current_setting('test.tenant_a')::uuid
       AND id = current_setting('test.assistant_user_message')::uuid;
    RAISE EXCEPTION 'immutable Assistant message was updated';
  EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN
    NULL;
  END;
  BEGIN
    UPDATE orqaly.assistant_turn_events
       SET event_payload = '{"changed":true}'::jsonb
     WHERE tenant_id = current_setting('test.tenant_a')::uuid
       AND id = current_setting('test.assistant_event')::uuid;
    RAISE EXCEPTION 'immutable Assistant lifecycle event was updated';
  EXCEPTION WHEN insufficient_privilege OR object_not_in_prerequisite_state THEN
    NULL;
  END;
END
$$;

SELECT set_config('orqaly.tenant_id', :'tenant_b', false);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM orqaly.assistant_threads
     WHERE tenant_id = current_setting('test.tenant_a')::uuid
  ) OR EXISTS (
    SELECT 1 FROM orqaly.assistant_messages
     WHERE tenant_id = current_setting('test.tenant_a')::uuid
  ) OR EXISTS (
    SELECT 1 FROM orqaly.assistant_turn_events
     WHERE tenant_id = current_setting('test.tenant_a')::uuid
  ) THEN
    RAISE EXCEPTION 'tenant B read tenant A Assistant records';
  END IF;
  BEGIN
    PERFORM orqaly.apply_transition(
      current_setting('test.tenant_a')::uuid,
      gen_random_uuid(),
      jsonb_build_object(
        'contractVersion', 'orqaly.workflow.v2',
        'event', jsonb_build_object(
          'tenantId', current_setting('test.tenant_a'), 'runId', gen_random_uuid()
        )
      )
    );
    RAISE EXCEPTION 'tenant B invoked a Tenant A transition';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;
RESET ROLE;

SET ROLE orqaly_worker;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM orqaly.outbox_events LIMIT 1;
    RAISE EXCEPTION 'worker bypassed the narrow claim RPC';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;
RESET ROLE;

SELECT 'workflow-v2-real-postgres-structural-tests-passed' AS result;
