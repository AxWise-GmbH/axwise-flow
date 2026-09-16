-- =============================================================================
-- MODULE: database-layer
-- FILE: supabase/seed-test.sql
-- PURPOSE: Minimal seed for integration tests. Fast to load and clean up.
--          Contains only the bare minimum records needed to test core flows.
-- USAGE: Run before integration tests, cleanup after (DELETE WHERE id IN (...))
-- =============================================================================

-- Minimal partner
INSERT INTO public.partners (id, data) VALUES (
  'test-partner-minimal',
  '{"name": "Test Corp", "funnelStatus": "active", "email": "test@testcorp.test"}'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Minimal agent
INSERT INTO public.agent_hub_agents (
  id, agent_id, role, capabilities
) VALUES (
  'b9000000-0000-0000-0000-000000000001',
  'agent-test-only',
  'Test Agent',
  '["test_capability"]'::jsonb
) ON CONFLICT (id) DO NOTHING;

-- Minimal project
INSERT INTO public.agent_hub_projects (
  id, project_id, title
) VALUES (
  'c9000000-0000-0000-0000-000000000001',
  'proj-test-only',
  'Integration Test Project'
) ON CONFLICT (id) DO NOTHING;

-- Minimal task — pending, no agent (tests unassigned flow)
INSERT INTO public.agent_hub_tasks (
  id, project_id, agent_id, title, status
) VALUES (
  'd9000000-0000-0000-0000-000000000001',
  'c9000000-0000-0000-0000-000000000001',
  NULL,
  'Test Task — Unassigned',
  'pending'
) ON CONFLICT (id) DO NOTHING;

-- Minimal audit log entry
INSERT INTO public.audit_log (
  id, action, entity, details
) VALUES (
  'e9000000-0000-0000-0000-000000000001',
  'TEST_ACTION',
  'test',
  'Integration test audit entry.'
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- CLEANUP QUERY (run after tests)
-- =============================================================================
-- DELETE FROM public.audit_log     WHERE id = 'e9000000-0000-0000-0000-000000000001';
-- DELETE FROM public.agent_hub_tasks    WHERE id = 'd9000000-0000-0000-0000-000000000001';
-- DELETE FROM public.agent_hub_projects WHERE id = 'c9000000-0000-0000-0000-000000000001';
-- DELETE FROM public.agent_hub_agents   WHERE id = 'b9000000-0000-0000-0000-000000000001';
-- DELETE FROM public.partners            WHERE id = 'test-partner-minimal';
