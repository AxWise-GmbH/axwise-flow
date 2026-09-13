alter table agentic.execution_plan_versions
  add constraint uq_agentic_plan_version_action_binding unique (
    org_id, workspace_id, user_id, id, plan_id, version_number, content_hash
  );

alter table agentic.execution_runs
  add constraint uq_agentic_run_action_binding unique (
    org_id, workspace_id, user_id, id, plan_id, plan_version_id
  );

alter table agentic.agent_delegations
  add column authority_version bigint not null default 1
    check (authority_version > 0),
  add constraint uq_agentic_delegation_approval_binding unique (
    org_id, workspace_id, user_id, id, agent_id, run_id, plan_version_id,
    authority_version, policy_hash
  );

alter table agentic.execution_steps
  add constraint uq_agentic_step_action_binding unique (
    org_id, workspace_id, user_id, id, run_id, plan_version_id,
    step_kind, assigned_agent_id, persona_version_id, persona_content_hash,
    delegation_id, descriptor_key, descriptor_version, descriptor_hash,
    executor_binding_key, executor_binding_version, executor_binding_hash,
    input_hash
  );

create table agentic.action_intents (
  id uuid primary key,
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  principal_id text not null,
  effect_id uuid not null,
  run_id uuid not null,
  step_id uuid not null,
  step_kind text not null check (step_kind in (
    'reason', 'retrieve', 'produce_artifact', 'connector_read', 'connector_write',
    'sandbox_work', 'human_input', 'review', 'wait_or_monitor', 'notify'
  )),
  plan_id uuid not null,
  plan_version_id uuid not null,
  plan_version_number integer not null check (plan_version_number > 0),
  plan_content_hash text not null check (plan_content_hash ~ '^[a-f0-9]{64}$'),
  agent_id uuid not null,
  persona_version_id uuid not null,
  persona_contract_version text not null check (persona_contract_version = '1.0'),
  persona_id text not null,
  persona_version_number integer not null check (persona_version_number > 0),
  persona_content_hash text not null check (persona_content_hash ~ '^[a-f0-9]{64}$'),
  delegation_id uuid not null,
  delegation_version bigint not null check (delegation_version > 0),
  delegation_policy_hash text not null check (delegation_policy_hash ~ '^[a-f0-9]{64}$'),
  descriptor_key text not null,
  descriptor_version text not null,
  descriptor_hash text not null check (descriptor_hash ~ '^[a-f0-9]{64}$'),
  executor_binding_key text not null,
  executor_binding_version text not null,
  executor_binding_hash text not null check (executor_binding_hash ~ '^[a-f0-9]{64}$'),
  canonical_parameters jsonb not null check (jsonb_typeof(canonical_parameters) = 'object'),
  canonical_input_hash text not null check (canonical_input_hash ~ '^[a-f0-9]{64}$'),
  effect_profile jsonb not null check (
    jsonb_typeof(effect_profile) = 'object'
    and effect_profile ->> 'externality' in ('read', 'write')
  ),
  data_egress_profile jsonb not null check (jsonb_typeof(data_egress_profile) = 'object'),
  targets jsonb not null check (jsonb_typeof(targets) = 'array' and jsonb_array_length(targets) > 0),
  external_preconditions jsonb not null check (jsonb_typeof(external_preconditions) = 'array'),
  connection_reference text not null,
  provider_key text not null,
  credential_owner_principal_id text not null,
  requested_scopes jsonb not null check (jsonb_typeof(requested_scopes) = 'array'),
  provider_operation_key text not null,
  provider_operation_version text not null,
  provider_operation_hash text not null check (provider_operation_hash ~ '^[a-f0-9]{64}$'),
  idempotency_scope text not null,
  idempotency_key text not null,
  policy_id text not null,
  policy_version text not null,
  policy_hash text not null check (policy_hash ~ '^[a-f0-9]{64}$'),
  reconciliation_policy jsonb not null check (jsonb_typeof(reconciliation_policy) = 'object'),
  compensation_policy jsonb not null check (jsonb_typeof(compensation_policy) = 'object'),
  contract_version text not null check (contract_version = '1.0'),
  canonicalization text not null check (canonicalization = 'rfc8785_v1'),
  hash_domain text not null check (hash_domain = 'orqaly.action-intent.v1'),
  intent_snapshot jsonb not null check (jsonb_typeof(intent_snapshot) = 'object'),
  intent_hash text not null check (intent_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null,
  constraint uq_agentic_action_intents_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_action_effect unique (org_id, workspace_id, user_id, effect_id),
  constraint uq_agentic_action_external_idempotency unique (
    org_id, workspace_id, user_id, provider_key, connection_reference,
    idempotency_scope, idempotency_key
  ),
  constraint uq_agentic_action_step unique (org_id, workspace_id, user_id, run_id, step_id),
  constraint uq_agentic_action_hash unique (org_id, workspace_id, user_id, intent_hash),
  constraint uq_agentic_action_subject_binding unique (
    org_id, workspace_id, user_id, id, run_id, step_id, intent_hash
  ),
  constraint ck_agentic_action_policy_identity check (policy_hash = delegation_policy_hash),
  constraint ck_agentic_action_snapshot_identity check (
    intent_snapshot ->> 'version' = 'orqaly_action_intent_v1'
    and intent_snapshot ->> 'organizationId' = org_id
    and intent_snapshot ->> 'workspaceId' = workspace_id
    and intent_snapshot ->> 'principalId' = principal_id
    and (intent_snapshot ->> 'actionIntentId')::uuid = id
    and (intent_snapshot ->> 'effectId')::uuid = effect_id
    and (intent_snapshot ->> 'runId')::uuid = run_id
    and (intent_snapshot ->> 'stepId')::uuid = step_id
    and intent_snapshot ->> 'contentHash' = intent_hash
  ),
  constraint fk_agentic_action_run foreign key (
    org_id, workspace_id, user_id, run_id, plan_id, plan_version_id
  ) references agentic.execution_runs (
    org_id, workspace_id, user_id, id, plan_id, plan_version_id
  ),
  constraint fk_agentic_action_plan_version foreign key (
    org_id, workspace_id, user_id, plan_version_id, plan_id,
    plan_version_number, plan_content_hash
  ) references agentic.execution_plan_versions (
    org_id, workspace_id, user_id, id, plan_id, version_number, content_hash
  ),
  constraint fk_agentic_action_step foreign key (
    org_id, workspace_id, user_id, step_id, run_id, plan_version_id,
    step_kind, agent_id, persona_version_id, persona_content_hash,
    delegation_id, descriptor_key, descriptor_version, descriptor_hash,
    executor_binding_key, executor_binding_version, executor_binding_hash,
    canonical_input_hash
  ) references agentic.execution_steps (
    org_id, workspace_id, user_id, id, run_id, plan_version_id,
    step_kind, assigned_agent_id, persona_version_id, persona_content_hash,
    delegation_id, descriptor_key, descriptor_version, descriptor_hash,
    executor_binding_key, executor_binding_version, executor_binding_hash,
    input_hash
  ),
  constraint fk_agentic_action_persona foreign key (
    org_id, workspace_id, user_id, persona_version_id, agent_id,
    persona_id, persona_content_hash, persona_version_number
  ) references agentic.agent_persona_versions (
    org_id, workspace_id, user_id, id, agent_id,
    persona_id, content_hash, version_number
  ),
  constraint fk_agentic_action_delegation foreign key (
    org_id, workspace_id, user_id, delegation_id,
    agent_id, run_id, plan_version_id, delegation_version,
    delegation_policy_hash
  ) references agentic.agent_delegations (
    org_id, workspace_id, user_id, id,
    agent_id, run_id, plan_version_id, authority_version,
    policy_hash
  )
);

create index ix_agentic_action_intents_run
  on agentic.action_intents (org_id, workspace_id, user_id, run_id, step_id);
create index ix_agentic_action_intents_connection
  on agentic.action_intents (
    org_id, workspace_id, user_id, connection_reference, provider_operation_key
  );

create table agentic.approval_subjects (
  id uuid primary key,
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  run_id uuid not null,
  plan_id uuid not null,
  plan_version_id uuid not null,
  plan_version_number integer not null check (plan_version_number > 0),
  plan_content_hash text not null check (plan_content_hash ~ '^[a-f0-9]{64}$'),
  subject_kind text not null check (subject_kind in (
    'scope', 'plan', 'step_effect', 'connection_grant', 'schedule', 'publication'
  )),
  subject_version text not null check (subject_version = 'orqaly_approval_subject_v1'),
  contract_version text not null check (contract_version = '1.0'),
  canonicalization text not null check (canonicalization = 'rfc8785_v1'),
  hash_domain text not null check (hash_domain = 'orqaly.approval.v1'),
  approver_principal_id text not null,
  nonce uuid not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  subject_payload jsonb not null check (jsonb_typeof(subject_payload) = 'object'),
  subject_hash text not null check (subject_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint uq_agentic_approval_subjects_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_approval_subject_hash unique (org_id, workspace_id, user_id, subject_hash),
  constraint uq_agentic_approval_subject_nonce unique (org_id, workspace_id, user_id, nonce),
  constraint uq_agentic_approval_subject_action_binding unique (
    org_id, workspace_id, user_id, id, run_id, subject_hash
  ),
  constraint uq_agentic_approval_subject_request_binding unique (
    org_id, workspace_id, user_id, id, run_id,
    subject_hash, approver_principal_id, expires_at
  ),
  constraint ck_agentic_approval_subject_window check (expires_at > issued_at),
  constraint ck_agentic_approval_subject_snapshot_identity check (
    subject_payload ->> 'version' = subject_version
    and subject_payload ->> 'subjectKind' = subject_kind
    and subject_payload ->> 'organizationId' = org_id
    and subject_payload ->> 'workspaceId' = workspace_id
    and subject_payload ->> 'approverPrincipalId' = approver_principal_id
    and (subject_payload ->> 'runId')::uuid = run_id
    and (subject_payload ->> 'nonce')::uuid = nonce
    and (subject_payload -> 'planVersion' ->> 'planId')::uuid = plan_id
    and (subject_payload -> 'planVersion' ->> 'planVersionId')::uuid = plan_version_id
    and (subject_payload -> 'planVersion' ->> 'planVersion')::integer = plan_version_number
    and subject_payload -> 'planVersion' ->> 'contentHash' = plan_content_hash
  ),
  constraint fk_agentic_approval_subject_run foreign key (
    org_id, workspace_id, user_id, run_id, plan_id, plan_version_id
  ) references agentic.execution_runs (
    org_id, workspace_id, user_id, id, plan_id, plan_version_id
  ),
  constraint fk_agentic_approval_subject_plan_version foreign key (
    org_id, workspace_id, user_id, plan_version_id, plan_id,
    plan_version_number, plan_content_hash
  ) references agentic.execution_plan_versions (
    org_id, workspace_id, user_id, id, plan_id, version_number, content_hash
  )
);

create index ix_agentic_approval_subjects_run
  on agentic.approval_subjects (org_id, workspace_id, user_id, run_id, created_at desc);

alter table agentic.approval_requests
  add column approval_subject_id uuid;

alter table agentic.approval_requests
  add constraint ck_agentic_approval_subject_required check (
    approval_subject_id is not null
  ) not valid,
  add constraint fk_agentic_approval_request_exact_subject foreign key (
    org_id, workspace_id, user_id, approval_subject_id, run_id,
    subject_hash, required_approver_id, expires_at
  ) references agentic.approval_subjects (
    org_id, workspace_id, user_id, id, run_id,
    subject_hash, approver_principal_id, expires_at
  ) not valid;

create index ix_agentic_approval_requests_subject
  on agentic.approval_requests (
    org_id, workspace_id, user_id, approval_subject_id
  ) where approval_subject_id is not null;

create table agentic.approval_subject_action_intents (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  run_id uuid not null,
  step_id uuid not null,
  approval_subject_id uuid not null,
  approval_subject_hash text not null check (approval_subject_hash ~ '^[a-f0-9]{64}$'),
  action_intent_id uuid not null,
  action_intent_hash text not null check (action_intent_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint uq_agentic_subject_actions_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_subject_action unique (
    org_id, workspace_id, user_id, approval_subject_id, action_intent_id
  ),
  constraint fk_agentic_subject_action_subject foreign key (
    org_id, workspace_id, user_id, approval_subject_id,
    run_id, approval_subject_hash
  ) references agentic.approval_subjects (
    org_id, workspace_id, user_id, id, run_id, subject_hash
  ),
  constraint fk_agentic_subject_action_intent foreign key (
    org_id, workspace_id, user_id, action_intent_id,
    run_id, step_id, action_intent_hash
  ) references agentic.action_intents (
    org_id, workspace_id, user_id, id, run_id, step_id, intent_hash
  )
);

create index ix_agentic_subject_actions_subject
  on agentic.approval_subject_action_intents (
    org_id, workspace_id, user_id, approval_subject_id
  );

create trigger agentic_action_intent_immutable
  before update or delete on agentic.action_intents
  for each row execute function agentic.reject_immutable_change();
create trigger agentic_approval_subject_immutable
  before update or delete on agentic.approval_subjects
  for each row execute function agentic.reject_immutable_change();
create trigger agentic_subject_action_immutable
  before update or delete on agentic.approval_subject_action_intents
  for each row execute function agentic.reject_immutable_change();

create or replace function agentic.reject_approval_subject_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.run_id,
    new.step_id,
    new.approval_subject_id,
    new.subject_kind,
    new.subject_hash,
    new.subject_snapshot,
    new.presentation,
    new.required_approver_id,
    new.expires_at
  ) is distinct from row(
    old.run_id,
    old.step_id,
    old.approval_subject_id,
    old.subject_kind,
    old.subject_hash,
    old.subject_snapshot,
    old.presentation,
    old.required_approver_id,
    old.expires_at
  ) then
    raise exception using
      errcode = '55000',
      message = 'approval subject is immutable';
  end if;
  return new;
end;
$$;

create trigger agentic_approval_subject_binding_immutable
  before update on agentic.approval_requests
  for each row execute function agentic.reject_approval_subject_change();

alter table agentic.approval_requests
  validate constraint ck_agentic_approval_subject_required;
alter table agentic.approval_requests
  validate constraint fk_agentic_approval_request_exact_subject;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'action_intents',
    'approval_subjects',
    'approval_subject_action_intents'
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
