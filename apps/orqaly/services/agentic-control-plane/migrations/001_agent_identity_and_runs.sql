create schema if not exists agentic;

create table agentic.materialization_requests (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'in_progress'
    check (state in ('in_progress', 'completed')),
  response_payload jsonb check (
    response_payload is null or jsonb_typeof(response_payload) = 'object'
  ),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint uq_agentic_materialization_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_materialization_key unique (
    org_id, workspace_id, user_id, idempotency_key
  ),
  constraint ck_agentic_materialization_completion check (
    (state = 'in_progress' and response_payload is null and completed_at is null)
    or (state = 'completed' and response_payload is not null and completed_at is not null)
  )
);

create index ix_agentic_materialization_created
  on agentic.materialization_requests (org_id, workspace_id, user_id, created_at desc);

create table agentic.agents (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  display_name text not null,
  agent_kind text not null default 'temporary'
    check (agent_kind in ('temporary', 'persistent')),
  state text not null default 'draft'
    check (state in ('draft', 'proposed', 'active', 'paused', 'revoked', 'expired', 'archived')),
  source_task_id text not null,
  source_decision_id text,
  project_id text,
  conversation_id text,
  originating_run_id uuid,
  expires_at timestamptz,
  revoked_at timestamptz,
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_agents_tenant unique (org_id, workspace_id, user_id, id),
  constraint ck_agentic_agents_expiry check (
    (agent_kind = 'persistent' and expires_at is null)
    or agent_kind = 'temporary'
  )
);

create index ix_agentic_agents_scope_state
  on agentic.agents (org_id, workspace_id, user_id, state, updated_at desc);
create index ix_agentic_agents_source_task
  on agentic.agents (org_id, workspace_id, user_id, source_task_id);

create table agentic.agent_persona_versions (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  agent_id uuid not null,
  version_number integer not null check (version_number > 0),
  contract_version text not null,
  persona_id text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  source_decision_id text,
  created_at timestamptz not null default now(),
  constraint uq_agentic_persona_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_persona_version unique (org_id, workspace_id, user_id, agent_id, version_number),
  constraint uq_agentic_persona_hash unique (org_id, workspace_id, user_id, agent_id, content_hash),
  constraint fk_agentic_persona_agent foreign key (org_id, workspace_id, user_id, agent_id)
    references agentic.agents (org_id, workspace_id, user_id, id)
);

create index ix_agentic_persona_agent
  on agentic.agent_persona_versions (org_id, workspace_id, user_id, agent_id, version_number desc);

create table agentic.agent_teams (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  source_task_id text not null,
  display_name text not null,
  state text not null default 'draft'
    check (state in ('draft', 'proposed', 'active', 'paused', 'revoked', 'expired', 'archived')),
  coordinator_agent_id uuid not null,
  maximum_members integer not null default 5 check (maximum_members between 1 and 5),
  maximum_depth integer not null default 2 check (maximum_depth between 1 and 2),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_teams_tenant unique (org_id, workspace_id, user_id, id),
  constraint fk_agentic_team_coordinator foreign key (org_id, workspace_id, user_id, coordinator_agent_id)
    references agentic.agents (org_id, workspace_id, user_id, id)
);

create index ix_agentic_teams_scope_state
  on agentic.agent_teams (org_id, workspace_id, user_id, state, updated_at desc);

create table agentic.agent_team_memberships (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  team_id uuid not null,
  agent_id uuid not null,
  parent_agent_id uuid,
  member_role text not null check (member_role in ('coordinator', 'worker', 'reviewer')),
  allowed_descriptor_families jsonb not null default '[]'::jsonb
    check (jsonb_typeof(allowed_descriptor_families) = 'array'),
  allowed_effect_profiles jsonb not null default '[]'::jsonb
    check (jsonb_typeof(allowed_effect_profiles) = 'array'),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  constraint uq_agentic_membership_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_membership_agent unique (org_id, workspace_id, user_id, team_id, agent_id),
  constraint ck_agentic_membership_parent check (parent_agent_id is null or parent_agent_id <> agent_id),
  constraint fk_agentic_membership_team foreign key (org_id, workspace_id, user_id, team_id)
    references agentic.agent_teams (org_id, workspace_id, user_id, id),
  constraint fk_agentic_membership_agent foreign key (org_id, workspace_id, user_id, agent_id)
    references agentic.agents (org_id, workspace_id, user_id, id),
  constraint fk_agentic_membership_parent foreign key (org_id, workspace_id, user_id, parent_agent_id)
    references agentic.agents (org_id, workspace_id, user_id, id)
);

create index ix_agentic_memberships_team
  on agentic.agent_team_memberships (org_id, workspace_id, user_id, team_id);
create index ix_agentic_memberships_agent
  on agentic.agent_team_memberships (org_id, workspace_id, user_id, agent_id);

create table agentic.agent_delegations (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  agent_id uuid not null,
  source_task_id text not null,
  allowed_descriptor_families jsonb not null default '[]'::jsonb
    check (jsonb_typeof(allowed_descriptor_families) = 'array'),
  allowed_effect_profiles jsonb not null default '[]'::jsonb
    check (jsonb_typeof(allowed_effect_profiles) = 'array'),
  allowed_targets jsonb not null default '[]'::jsonb
    check (jsonb_typeof(allowed_targets) = 'array'),
  allowed_data_classes jsonb not null default '[]'::jsonb
    check (jsonb_typeof(allowed_data_classes) = 'array'),
  maximum_cost_minor bigint not null default 0 check (maximum_cost_minor >= 0),
  currency text not null default 'EUR' check (currency ~ '^[A-Z]{3}$'),
  policy_hash text not null check (policy_hash ~ '^[a-f0-9]{64}$'),
  granted_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  constraint uq_agentic_delegations_tenant unique (org_id, workspace_id, user_id, id),
  constraint fk_agentic_delegation_agent foreign key (org_id, workspace_id, user_id, agent_id)
    references agentic.agents (org_id, workspace_id, user_id, id),
  constraint ck_agentic_delegation_window check (
    expires_at is null or granted_at is null or expires_at > granted_at
  )
);

create index ix_agentic_delegations_agent
  on agentic.agent_delegations (org_id, workspace_id, user_id, agent_id, revoked_at, expires_at);

create table agentic.execution_plans (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  source_task_id text not null,
  source_decision_id text not null,
  owner_agent_id uuid not null,
  team_id uuid,
  state text not null default 'draft'
    check (state in ('draft', 'proposed', 'approved', 'superseded', 'cancelled')),
  current_version_number integer not null default 0 check (current_version_number >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_plans_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_plan_decision unique (org_id, workspace_id, user_id, source_decision_id),
  constraint fk_agentic_plan_agent foreign key (org_id, workspace_id, user_id, owner_agent_id)
    references agentic.agents (org_id, workspace_id, user_id, id),
  constraint fk_agentic_plan_team foreign key (org_id, workspace_id, user_id, team_id)
    references agentic.agent_teams (org_id, workspace_id, user_id, id)
);

create index ix_agentic_plans_source
  on agentic.execution_plans (org_id, workspace_id, user_id, source_task_id, updated_at desc);

create table agentic.execution_plan_proposals (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  plan_id uuid not null,
  source_contract_version text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  proposal jsonb not null check (jsonb_typeof(proposal) = 'object'),
  created_at timestamptz not null default now(),
  constraint uq_agentic_plan_proposal_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_plan_proposal_hash unique (
    org_id, workspace_id, user_id, plan_id, content_hash
  ),
  constraint fk_agentic_plan_proposal_plan foreign key (
    org_id, workspace_id, user_id, plan_id
  ) references agentic.execution_plans (org_id, workspace_id, user_id, id)
);

create index ix_agentic_plan_proposals_plan
  on agentic.execution_plan_proposals (org_id, workspace_id, user_id, plan_id, created_at desc);

create table agentic.execution_plan_versions (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  plan_id uuid not null,
  submission_key text not null check (char_length(submission_key) between 1 and 512),
  version_number integer not null check (version_number > 0),
  contract_version text not null,
  canonicalization text not null check (canonicalization = 'rfc8785_v1'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  descriptor_set_hash text not null check (descriptor_set_hash ~ '^[a-f0-9]{64}$'),
  dag jsonb not null check (jsonb_typeof(dag) = 'object'),
  revision_reason text,
  supersedes_version_id uuid,
  created_at timestamptz not null default now(),
  constraint uq_agentic_plan_versions_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_plan_version unique (org_id, workspace_id, user_id, plan_id, version_number),
  constraint uq_agentic_plan_submission unique (org_id, workspace_id, user_id, plan_id, submission_key),
  constraint uq_agentic_plan_hash unique (org_id, workspace_id, user_id, plan_id, content_hash),
  constraint fk_agentic_plan_version_plan foreign key (org_id, workspace_id, user_id, plan_id)
    references agentic.execution_plans (org_id, workspace_id, user_id, id),
  constraint fk_agentic_plan_version_parent foreign key (org_id, workspace_id, user_id, supersedes_version_id)
    references agentic.execution_plan_versions (org_id, workspace_id, user_id, id)
);

create index ix_agentic_plan_versions_plan
  on agentic.execution_plan_versions (org_id, workspace_id, user_id, plan_id, version_number desc);

create table agentic.execution_runs (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  source_task_id text not null,
  agent_id uuid not null,
  team_id uuid,
  plan_id uuid not null,
  plan_version_id uuid,
  state text not null default 'draft'
    check (state in (
      'draft', 'awaiting_scope_approval', 'planning', 'awaiting_plan_approval',
      'queued', 'running', 'waiting_for_customer', 'waiting_for_approval',
      'pause_requested', 'paused', 'cancel_requested', 'cancelled', 'completed',
      'completed_with_gaps', 'failed', 'outcome_unknown'
    )),
  requested_by text not null,
  budget_minor bigint check (budget_minor is null or budget_minor >= 0),
  reserved_minor bigint not null default 0 check (reserved_minor >= 0),
  spent_minor bigint not null default 0 check (spent_minor >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  deadline_at timestamptz,
  started_at timestamptz,
  terminal_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_runs_tenant unique (org_id, workspace_id, user_id, id),
  constraint fk_agentic_run_agent foreign key (org_id, workspace_id, user_id, agent_id)
    references agentic.agents (org_id, workspace_id, user_id, id),
  constraint fk_agentic_run_team foreign key (org_id, workspace_id, user_id, team_id)
    references agentic.agent_teams (org_id, workspace_id, user_id, id),
  constraint fk_agentic_run_plan foreign key (org_id, workspace_id, user_id, plan_id)
    references agentic.execution_plans (org_id, workspace_id, user_id, id),
  constraint fk_agentic_run_plan_version foreign key (org_id, workspace_id, user_id, plan_version_id)
    references agentic.execution_plan_versions (org_id, workspace_id, user_id, id),
  constraint ck_agentic_run_budget check (
    budget_minor is null or reserved_minor + spent_minor <= budget_minor
  ),
  constraint ck_agentic_run_plan_version check (
    plan_version_id is not null or state in ('draft', 'awaiting_scope_approval', 'planning', 'cancel_requested', 'cancelled', 'failed')
  )
);

create index ix_agentic_runs_scope_state
  on agentic.execution_runs (org_id, workspace_id, user_id, state, updated_at desc);
create index ix_agentic_runs_agent
  on agentic.execution_runs (org_id, workspace_id, user_id, agent_id, created_at desc);

alter table agentic.agents
  add constraint fk_agentic_agent_originating_run
  foreign key (org_id, workspace_id, user_id, originating_run_id)
  references agentic.execution_runs (org_id, workspace_id, user_id, id);

create table agentic.execution_steps (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  run_id uuid not null,
  plan_version_id uuid not null,
  node_id text not null,
  step_kind text not null check (step_kind in (
    'reason', 'retrieve', 'produce_artifact', 'connector_read', 'connector_write',
    'sandbox_work', 'human_input', 'review', 'wait_or_monitor', 'notify'
  )),
  descriptor_key text not null,
  descriptor_version text not null,
  descriptor_hash text not null check (descriptor_hash ~ '^[a-f0-9]{64}$'),
  executor_binding_key text not null,
  executor_binding_version text not null,
  executor_binding_hash text not null check (executor_binding_hash ~ '^[a-f0-9]{64}$'),
  effect_profile jsonb not null check (jsonb_typeof(effect_profile) = 'object'),
  data_egress_profile jsonb not null check (jsonb_typeof(data_egress_profile) = 'object'),
  dependencies jsonb not null default '[]'::jsonb check (jsonb_typeof(dependencies) = 'array'),
  assigned_agent_id uuid not null,
  reviewer_agent_id uuid,
  input_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(input_payload) = 'object'),
  input_hash text not null check (input_hash ~ '^[a-f0-9]{64}$'),
  expected_output_schema_hash text not null check (expected_output_schema_hash ~ '^[a-f0-9]{64}$'),
  requires_distinct_reviewer boolean not null default false,
  maximum_turns integer not null default 1 check (maximum_turns between 1 and 1000),
  maximum_tokens integer not null default 1000 check (maximum_tokens between 1 and 100000000),
  maximum_tool_calls integer not null default 0 check (maximum_tool_calls between 0 and 10000),
  maximum_duration_seconds integer not null check (maximum_duration_seconds between 1 and 86400),
  maximum_attempts integer not null default 1 check (maximum_attempts between 1 and 10),
  maximum_cost_minor bigint check (maximum_cost_minor is null or maximum_cost_minor >= 0),
  currency text check (currency is null or currency ~ '^[A-Z]{3}$'),
  deadline_at timestamptz,
  state text not null default 'pending' check (state in (
    'pending', 'ready', 'queued', 'running', 'waiting_for_customer',
    'waiting_for_approval', 'pause_requested', 'paused', 'cancel_requested',
    'cancelled', 'completed', 'failed', 'outcome_unknown', 'skipped'
  )),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_steps_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_step_node unique (org_id, workspace_id, user_id, run_id, node_id),
  constraint ck_agentic_step_reviewer check (reviewer_agent_id is null or reviewer_agent_id <> assigned_agent_id),
  constraint fk_agentic_step_run foreign key (org_id, workspace_id, user_id, run_id)
    references agentic.execution_runs (org_id, workspace_id, user_id, id),
  constraint fk_agentic_step_plan_version foreign key (org_id, workspace_id, user_id, plan_version_id)
    references agentic.execution_plan_versions (org_id, workspace_id, user_id, id),
  constraint fk_agentic_step_agent foreign key (org_id, workspace_id, user_id, assigned_agent_id)
    references agentic.agents (org_id, workspace_id, user_id, id),
  constraint fk_agentic_step_reviewer foreign key (org_id, workspace_id, user_id, reviewer_agent_id)
    references agentic.agents (org_id, workspace_id, user_id, id)
);

create index ix_agentic_steps_run_state
  on agentic.execution_steps (org_id, workspace_id, user_id, run_id, state, created_at);

create table agentic.step_attempts (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  run_id uuid not null,
  step_id uuid not null,
  attempt_number integer not null check (attempt_number > 0),
  executor_kind text not null,
  executor_binding text not null,
  executor_binding_hash text not null check (executor_binding_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'queued' check (state in (
    'queued', 'running', 'waiting', 'succeeded', 'failed', 'cancelled', 'outcome_unknown'
  )),
  lease_token uuid,
  lease_fence bigint not null default 0 check (lease_fence >= 0),
  lease_expires_at timestamptz,
  deadline_at timestamptz not null,
  started_at timestamptz,
  terminal_at timestamptz,
  usage_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(usage_payload) = 'object'),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_attempts_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_step_attempt unique (org_id, workspace_id, user_id, step_id, attempt_number),
  constraint fk_agentic_attempt_run foreign key (org_id, workspace_id, user_id, run_id)
    references agentic.execution_runs (org_id, workspace_id, user_id, id),
  constraint fk_agentic_attempt_step foreign key (org_id, workspace_id, user_id, step_id)
    references agentic.execution_steps (org_id, workspace_id, user_id, id)
);

create index ix_agentic_attempts_claim
  on agentic.step_attempts (org_id, workspace_id, state, lease_expires_at, created_at)
  where state in ('queued', 'running');

create table agentic.step_receipts (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  run_id uuid not null,
  step_id uuid not null,
  attempt_id uuid not null,
  receipt_kind text not null,
  receipt_payload jsonb not null check (jsonb_typeof(receipt_payload) = 'object'),
  receipt_hash text not null check (receipt_hash ~ '^[a-f0-9]{64}$'),
  actor_type text not null check (actor_type in ('agent', 'executor', 'gateway', 'human', 'system')),
  created_at timestamptz not null default now(),
  constraint uq_agentic_receipts_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_receipt_attempt_hash unique (org_id, workspace_id, user_id, attempt_id, receipt_hash),
  constraint fk_agentic_receipt_run foreign key (org_id, workspace_id, user_id, run_id)
    references agentic.execution_runs (org_id, workspace_id, user_id, id),
  constraint fk_agentic_receipt_step foreign key (org_id, workspace_id, user_id, step_id)
    references agentic.execution_steps (org_id, workspace_id, user_id, id),
  constraint fk_agentic_receipt_attempt foreign key (org_id, workspace_id, user_id, attempt_id)
    references agentic.step_attempts (org_id, workspace_id, user_id, id)
);

create index ix_agentic_receipts_run
  on agentic.step_receipts (org_id, workspace_id, user_id, run_id, created_at);

create table agentic.approval_requests (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  run_id uuid not null,
  step_id uuid,
  subject_kind text not null,
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  subject_snapshot jsonb not null check (jsonb_typeof(subject_snapshot) = 'object'),
  presentation jsonb not null check (jsonb_typeof(presentation) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'expired', 'superseded')),
  required_approver_id text not null,
  expires_at timestamptz not null,
  decided_at timestamptz,
  decision_reason text,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  constraint uq_agentic_approvals_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_approval_subject unique (org_id, workspace_id, user_id, subject_hash),
  constraint fk_agentic_approval_run foreign key (org_id, workspace_id, user_id, run_id)
    references agentic.execution_runs (org_id, workspace_id, user_id, id),
  constraint fk_agentic_approval_step foreign key (org_id, workspace_id, user_id, step_id)
    references agentic.execution_steps (org_id, workspace_id, user_id, id)
);

create index ix_agentic_approvals_pending
  on agentic.approval_requests (org_id, workspace_id, user_id, status, expires_at)
  where status = 'pending';

create table agentic.run_events (
  sequence_id bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  run_id uuid not null,
  step_id uuid,
  attempt_id uuid,
  event_type text not null,
  event_version integer not null default 1 check (event_version > 0),
  actor_type text not null,
  safe_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_payload) = 'object'),
  correlation_id text not null,
  created_at timestamptz not null default now(),
  constraint uq_agentic_events_tenant unique (org_id, workspace_id, user_id, id),
  constraint fk_agentic_event_run foreign key (org_id, workspace_id, user_id, run_id)
    references agentic.execution_runs (org_id, workspace_id, user_id, id),
  constraint fk_agentic_event_step foreign key (org_id, workspace_id, user_id, step_id)
    references agentic.execution_steps (org_id, workspace_id, user_id, id),
  constraint fk_agentic_event_attempt foreign key (org_id, workspace_id, user_id, attempt_id)
    references agentic.step_attempts (org_id, workspace_id, user_id, id)
);

create index ix_agentic_events_run_cursor
  on agentic.run_events (org_id, workspace_id, user_id, run_id, sequence_id);

create table agentic.outbox_events (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  run_id uuid,
  event_type text not null,
  destination text not null,
  dedupe_key text not null,
  safe_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(safe_payload) = 'object'),
  state text not null default 'pending'
    check (state in ('pending', 'leased', 'delivered', 'retry_wait', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_agentic_outbox_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_outbox_dedupe unique (org_id, workspace_id, user_id, destination, dedupe_key),
  constraint fk_agentic_outbox_run foreign key (org_id, workspace_id, user_id, run_id)
    references agentic.execution_runs (org_id, workspace_id, user_id, id)
);

create index ix_agentic_outbox_claim
  on agentic.outbox_events (state, next_attempt_at, lease_expires_at)
  where state in ('pending', 'retry_wait', 'leased');

create or replace function agentic.reject_immutable_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception using
    errcode = '55000',
    message = format('%I is immutable', tg_table_name);
end;
$$;

create trigger agentic_persona_immutable
  before update or delete on agentic.agent_persona_versions
  for each row execute function agentic.reject_immutable_change();
create trigger agentic_plan_version_immutable
  before update or delete on agentic.execution_plan_versions
  for each row execute function agentic.reject_immutable_change();
create trigger agentic_plan_proposal_immutable
  before update or delete on agentic.execution_plan_proposals
  for each row execute function agentic.reject_immutable_change();
create trigger agentic_receipt_immutable
  before update or delete on agentic.step_receipts
  for each row execute function agentic.reject_immutable_change();
create trigger agentic_run_event_immutable
  before update or delete on agentic.run_events
  for each row execute function agentic.reject_immutable_change();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'materialization_requests',
    'agents',
    'agent_persona_versions',
    'agent_teams',
    'agent_team_memberships',
    'agent_delegations',
    'execution_plans',
    'execution_plan_proposals',
    'execution_plan_versions',
    'execution_runs',
    'execution_steps',
    'step_attempts',
    'step_receipts',
    'approval_requests',
    'run_events',
    'outbox_events'
  ] loop
    execute format('alter table agentic.%I enable row level security', table_name);
    execute format('alter table agentic.%I force row level security', table_name);
    execute format(
      'create policy tenant_isolation on agentic.%I for all to public using (' ||
      'org_id = nullif(current_setting(''app.organization_id'', true), '''') and ' ||
      'workspace_id = nullif(current_setting(''app.workspace_id'', true), '''') and ' ||
      'user_id = nullif(current_setting(''app.user_id'', true), '''')' ||
      ') with check (' ||
      'org_id = nullif(current_setting(''app.organization_id'', true), '''') and ' ||
      'workspace_id = nullif(current_setting(''app.workspace_id'', true), '''') and ' ||
      'user_id = nullif(current_setting(''app.user_id'', true), '''')' ||
      ')',
      table_name
    );
  end loop;
end;
$$;
