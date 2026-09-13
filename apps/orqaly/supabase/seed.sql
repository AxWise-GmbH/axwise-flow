-- =============================================================================
-- MODULE: database-layer
-- FILE: supabase/seed.sql
-- PURPOSE: Populates the database with test data for local development
--          and integration tests. Uses fixed UUIDs for test referenceability.
-- USAGE: supabase db reset && psql -f supabase/seed.sql
--        OR: supabase db reset (if config.toml points to this file)
-- WARNING: Never run against production.
-- =============================================================================

-- Fixed UUIDs for stable test references
-- Agent IDs
-- Agent 1 (full workload): b0000000-0000-0000-0000-000000000001
-- Agent 2 (partial):       b0000000-0000-0000-0000-000000000002
-- Agent 3 (no tasks):      b0000000-0000-0000-0000-000000000003

-- Project IDs
-- Project 1: c0000000-0000-0000-0000-000000000001

-- Task IDs
-- Task 1 (pending):        d0000000-0000-0000-0000-000000000001
-- Task 2 (assigned):       d0000000-0000-0000-0000-000000000002
-- Task 3 (in_progress):    d0000000-0000-0000-0000-000000000003
-- Task 4 (completed):      d0000000-0000-0000-0000-000000000004
-- Task 5 (cancelled):      d0000000-0000-0000-0000-000000000005

-- Audit log IDs
-- Audit 1-5: e0000000-0000-0000-0000-00000000000x

-- =============================================================================
-- SECTION 1: BUSINESSES (stored as partners)
-- =============================================================================

INSERT INTO public.partners (id, data, created_at, updated_at) VALUES

  -- Business 1: Acme Corp — active partner with full data
  (
    'partner-acme-corp',
    '{
      "name": "Acme Corp",
      "email": "contact@acmecorp.test",
      "phone": "+1-555-000-0001",
      "website": "https://acmecorp.test",
      "funnelStatus": "active",
      "industry": "Technology",
      "revenue": 500000,
      "country": "US",
      "notes": "Seed data — Acme Corp test business"
    }'::jsonb,
    now() - interval '30 days',
    now() - interval '2 days'
  ),

  -- Business 2: Beta Agency — onboarding partner, minimal data
  (
    'partner-beta-agency',
    '{
      "name": "Beta Agency",
      "email": "hello@betaagency.test",
      "phone": "+1-555-000-0002",
      "funnelStatus": "onboarding",
      "industry": "Marketing",
      "revenue": 120000,
      "country": "CA",
      "notes": "Seed data — Beta Agency test business, still onboarding"
    }'::jsonb,
    now() - interval '7 days',
    now() - interval '1 day'
  )

ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 2: AGENTS (agent_hub_agents)
-- =============================================================================

INSERT INTO public.agent_hub_agents (
  id, user_id, agent_id, role, capabilities, input_format, output_format,
  constraints, performance_kpis, availability_status, cost_per_task,
  created_at, updated_at
) VALUES

  -- Agent 1: Transcription specialist, high rating, assigned tasks
  (
    'b0000000-0000-0000-0000-000000000001',
    NULL, -- No user owner — system agent for testing
    'agent-transcription-alpha',
    'Transcription Specialist',
    '["audio_transcription", "speaker_diarization", "multi_language"]'::jsonb,
    'audio/mp3, audio/wav, audio/m4a',
    'application/json',
    '{"max_file_size_mb": 500, "max_duration_minutes": 120}'::jsonb,
    '{"accuracy_rate": 0.97, "avg_turnaround_seconds": 45, "tasks_completed": 142}'::jsonb,
    'available',
    2.50,
    now() - interval '60 days',
    now() - interval '1 day'
  ),

  -- Agent 2: Outreach agent, moderate rating, partially loaded
  (
    'b0000000-0000-0000-0000-000000000002',
    NULL,
    'agent-outreach-beta',
    'Partner Outreach Agent',
    '["email_drafting", "partner_scoring", "crm_update"]'::jsonb,
    'application/json',
    'text/plain, application/json',
    '{"max_emails_per_hour": 50}'::jsonb,
    '{"accuracy_rate": 0.89, "avg_turnaround_seconds": 120, "tasks_completed": 38}'::jsonb,
    'available',
    1.00,
    now() - interval '45 days',
    now() - interval '3 days'
  ),

  -- Agent 3 (edge case): New agent with 0 tasks, never used
  (
    'b0000000-0000-0000-0000-000000000003',
    NULL,
    'agent-analytics-gamma',
    'Analytics Agent',
    '["reporting", "chart_generation", "data_export"]'::jsonb,
    'application/json',
    'application/json, text/csv',
    '{}'::jsonb,
    '{"accuracy_rate": 0, "avg_turnaround_seconds": 0, "tasks_completed": 0}'::jsonb,
    'available',
    1.50,
    now() - interval '2 days',
    now()
  )

ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 3: PROJECT (required as FK for tasks)
-- =============================================================================

INSERT INTO public.agent_hub_projects (
  id, user_id, project_id, title, description, objectives,
  budget, deadline, priority_level, required_capabilities,
  expected_kpis, risk_level, status, created_at, updated_at
) VALUES (
  'c0000000-0000-0000-0000-000000000001',
  NULL,
  'proj-seed-001',
  'Seed Test Project',
  'Test project used exclusively for seed data and integration tests.',
  '["Validate task lifecycle", "Test agent assignment", "Verify payouts"]'::jsonb,
  10000.00,
  now() + interval '90 days',
  'medium',
  '["audio_transcription", "email_drafting"]'::jsonb,
  '{"completion_rate": 0.9, "on_time_rate": 0.85}'::jsonb,
  'low',
  'active',
  now() - interval '20 days',
  now()
)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 4: TASKS (5 tasks, various statuses)
-- =============================================================================

INSERT INTO public.agent_hub_tasks (
  id, user_id, project_id, agent_id, title, description,
  status, input_payload, output_payload, started_at, completed_at, created_at
) VALUES

  -- Task 1: pending — no agent assigned (edge case)
  (
    'd0000000-0000-0000-0000-000000000001',
    NULL,
    'c0000000-0000-0000-0000-000000000001',
    NULL, -- Edge case: no agent assigned yet
    'Transcribe onboarding call — Acme Corp',
    'Raw audio from first onboarding call with Acme Corp team.',
    'pending',
    '{"audio_url": "https://storage.test/calls/acme-onboarding-001.mp3", "duration_seconds": 1820}'::jsonb,
    NULL,
    NULL,
    NULL,
    now() - interval '3 days'
  ),

  -- Task 2: assigned — agent assigned but not started
  (
    'd0000000-0000-0000-0000-000000000002',
    NULL,
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Transcribe weekly sync — Beta Agency',
    'Weekly sync recording, 45 minutes, two speakers.',
    'assigned',
    '{"audio_url": "https://storage.test/calls/beta-weekly-sync-004.mp3", "duration_seconds": 2700}'::jsonb,
    NULL,
    NULL,
    NULL,
    now() - interval '1 day'
  ),

  -- Task 3: in_progress — actively being processed
  (
    'd0000000-0000-0000-0000-000000000003',
    NULL,
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000001',
    'Draft outreach email — Acme Corp renewal',
    'Generate personalised renewal email for Acme Corp Q2 review.',
    'in_progress',
    '{"partner_id": "partner-acme-corp", "template": "renewal_q2", "tone": "professional"}'::jsonb,
    NULL,
    now() - interval '2 hours',
    NULL,
    now() - interval '4 hours'
  ),

  -- Task 4: completed — full lifecycle, has output
  (
    'd0000000-0000-0000-0000-000000000004',
    NULL,
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    'Score partner fit — Beta Agency',
    'Run partner scoring model against Beta Agency profile.',
    'completed',
    '{"partner_id": "partner-beta-agency", "model": "v2"}'::jsonb,
    '{"score": 78, "tier": "silver", "recommended_actions": ["schedule_review", "upsell_pro"]}'::jsonb,
    now() - interval '5 days',
    now() - interval '4 days',
    now() - interval '6 days'
  ),

  -- Task 5: cancelled — was stopped before completion
  (
    'd0000000-0000-0000-0000-000000000005',
    NULL,
    'c0000000-0000-0000-0000-000000000001',
    'b0000000-0000-0000-0000-000000000002',
    'Export partner report — Q1 summary',
    'Quarterly PDF export for all active partners. Cancelled — report format changed.',
    'cancelled',
    '{"format": "pdf", "quarter": "Q1-2025", "partners": ["partner-acme-corp"]}'::jsonb,
    NULL,
    NULL,
    NULL,
    now() - interval '10 days'
  )

ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 5: PAYOUTS (85/15 revenue split)
-- Uses the canonical generated-share schema from migration 026.
-- =============================================================================

INSERT INTO public.payouts (
  id, gross_amount, currency, status, paid_at, created_at, updated_at
) VALUES

  -- Payout 1: pending. Generated columns calculate the 85/15 split.
  (
    'f0000000-0000-0000-0000-000000000001',
    100.00,
    'USD',
    'pending',
    NULL,
    now() - interval '1 day',
    now() - interval '1 day'
  ),

  -- Payout 2: paid and settled.
  (
    'f0000000-0000-0000-0000-000000000002',
    250.00,
    'USD',
    'paid',
    now() - interval '3 days',
    now() - interval '5 days',
    now() - interval '5 days'
  )

ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 6: AUDIT LOG (5 entries across different modules)
-- =============================================================================

INSERT INTO public.audit_log (
  id, action, entity, entity_id, user_id, user_email,
  actor_type, agent_id, agent_name, details, created_at
) VALUES

  -- Entry 1: partner-management — partner created
  (
    'e0000000-0000-0000-0000-000000000001',
    'CREATE',
    'partner',
    'partner-acme-corp',
    NULL,
    'admin@orchestratori.test',
    'user',
    NULL,
    NULL,
    'Partner Acme Corp created during onboarding.',
    now() - interval '30 days'
  ),

  -- Entry 2: agent-core — agent dispatched a task
  (
    'e0000000-0000-0000-0000-000000000002',
    'DISPATCH',
    'agent_hub_task',
    'd0000000-0000-0000-0000-000000000004',
    NULL,
    NULL,
    'agent',
    'agent-outreach-beta',
    'Partner Outreach Agent',
    'Task dispatched to outreach agent for partner scoring.',
    now() - interval '6 days'
  ),

  -- Entry 3: api-gateway — failed auth attempt
  (
    'e0000000-0000-0000-0000-000000000003',
    'AUTH_FAIL',
    'session',
    NULL,
    NULL,
    'unknown@external.test',
    'user',
    NULL,
    NULL,
    'Invalid JWT presented at /api/app — request blocked.',
    now() - interval '2 days'
  ),

  -- Entry 4: database-layer — RLS policy triggered
  (
    'e0000000-0000-0000-0000-000000000004',
    'RLS_BLOCK',
    'partner',
    'partner-beta-agency',
    NULL,
    'readonly@orchestratori.test',
    'user',
    NULL,
    NULL,
    'Read access blocked by RLS — user does not own this partner record.',
    now() - interval '1 day'
  ),

  -- Entry 5: payments — payout marked paid
  (
    'e0000000-0000-0000-0000-000000000005',
    'PAYOUT_SETTLED',
    'payout',
    'f0000000-0000-0000-0000-000000000002',
    NULL,
    'billing@orchestratori.test',
    'user',
    NULL,
    NULL,
    'Payout of $250.00 settled. Agent share $212.50, platform $37.50.',
    now() - interval '3 days'
  )

ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- SECTION 7: FEATURE FLAGS
-- Creates table if not yet in migrations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.feature_flags (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL UNIQUE,
  enabled     boolean NOT NULL DEFAULT false,
  description text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read feature_flags" ON public.feature_flags;
CREATE POLICY "Authenticated users can read feature_flags" ON public.feature_flags
  FOR SELECT USING (auth.role() = 'authenticated');

INSERT INTO public.feature_flags (key, enabled, description, created_at) VALUES

  -- Flag 1: enabled — agent marketplace live
  (
    'agent_marketplace_enabled',
    true,
    'Enables the agent marketplace UI and 85/15 payout split logic.',
    now() - interval '14 days'
  ),

  -- Flag 2: disabled — stripe connect not yet wired
  (
    'stripe_connect_enabled',
    false,
    'Enables Stripe Connect for automated agent payouts. Disabled until payment module is complete.',
    now() - interval '14 days'
  ),

  -- Flag 3: disabled — consilium AI layer in development
  (
    'consilium_enabled',
    false,
    'Enables the Consilium AI decision layer for automated partner recommendations.',
    now() - interval '7 days'
  )

ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- SECTION 8: NOTIFICATIONS (3 entries — queued, sent, failed)
-- =============================================================================

INSERT INTO public.notifications (
  id, timestamp, priority, entity_type, entity_id,
  trigger_type, profit_impact_score, revenue_at_risk,
  status, assigned_to, data, user_id
) VALUES

  -- Notification 1: queued — waiting to be sent
  (
    'notif-seed-001',
    now() - interval '1 hour',
    'high',
    'partner',
    'partner-acme-corp',
    'renewal_due',
    85,
    12500.00,
    'queued',
    '{"admin@orchestratori.test"}'::text[],
    '{"message": "Acme Corp contract renewal due in 14 days.", "action_url": "/partners/partner-acme-corp"}'::jsonb,
    NULL
  ),

  -- Notification 2: sent — successfully delivered
  (
    'notif-seed-002',
    now() - interval '2 days',
    'medium',
    'agent_hub_task',
    'd0000000-0000-0000-0000-000000000004',
    'task_completed',
    40,
    0.00,
    'sent',
    '{"admin@orchestratori.test"}'::text[],
    '{"message": "Partner scoring task completed for Beta Agency. Score: 78.", "action_url": "/agent-hub/tasks/d0000000-0000-0000-0000-000000000004"}'::jsonb,
    NULL
  ),

  -- Notification 3: failed — delivery error
  (
    'notif-seed-003',
    now() - interval '3 days',
    'low',
    'partner',
    'partner-beta-agency',
    'onboarding_stalled',
    20,
    3000.00,
    'failed',
    '{}'::text[],
    '{"message": "Beta Agency onboarding has stalled — no activity in 5 days.", "error": "RESEND_DELIVERY_FAILED", "retry_count": 3}'::jsonb,
    NULL
  )

ON CONFLICT (id) DO NOTHING;
