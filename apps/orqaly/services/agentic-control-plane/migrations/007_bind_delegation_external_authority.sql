alter table agentic.agent_delegations
  add constraint ck_agentic_delegation_target_ceiling_snapshot check (
    policy_snapshot ? 'authorityCeiling'
    and jsonb_typeof(policy_snapshot -> 'authorityCeiling') = 'object'
    and jsonb_typeof(
      policy_snapshot -> 'authorityCeiling' -> 'allowedTargets'
    ) = 'array'
    and allowed_targets = policy_snapshot -> 'authorityCeiling' -> 'allowedTargets'
  ) not valid;

create or replace function agentic.reject_delegation_authority_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '55000',
      message = 'Agent delegation authority is immutable';
  end if;
  if row(
    new.org_id,
    new.workspace_id,
    new.user_id,
    new.agent_id,
    new.source_task_id,
    new.allowed_descriptor_families,
    new.allowed_effect_profiles,
    new.allowed_targets,
    new.allowed_data_classes,
    new.maximum_cost_minor,
    new.currency,
    new.policy_hash,
    new.plan_version_id,
    new.run_id,
    new.policy_snapshot,
    new.authority_version,
    new.created_at
  ) is distinct from row(
    old.org_id,
    old.workspace_id,
    old.user_id,
    old.agent_id,
    old.source_task_id,
    old.allowed_descriptor_families,
    old.allowed_effect_profiles,
    old.allowed_targets,
    old.allowed_data_classes,
    old.maximum_cost_minor,
    old.currency,
    old.policy_hash,
    old.plan_version_id,
    old.run_id,
    old.policy_snapshot,
    old.authority_version,
    old.created_at
  ) then
    raise exception using
      errcode = '55000',
      message = 'Agent delegation authority is immutable';
  end if;
  return new;
end;
$$;

create trigger agentic_delegation_authority_immutable
  before update or delete on agentic.agent_delegations
  for each row execute function agentic.reject_delegation_authority_change();

create or replace function agentic.assert_action_intent_within_delegation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  delegation_row agentic.agent_delegations%rowtype;
  plan_node jsonb;
  step_node_id text;
  column_action jsonb;
  snapshot_action jsonb;
begin
  select d.*
    into delegation_row
    from agentic.agent_delegations d
   where d.org_id = new.org_id
     and d.workspace_id = new.workspace_id
     and d.user_id = new.user_id
     and d.id = new.delegation_id
     and d.agent_id = new.agent_id
     and d.run_id = new.run_id
     and d.plan_version_id = new.plan_version_id
     and d.authority_version = new.delegation_version
     and d.policy_hash = new.delegation_policy_hash;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'action intent delegation identity mismatch';
  end if;

  if delegation_row.allowed_targets is distinct from
    delegation_row.policy_snapshot -> 'authorityCeiling' -> 'allowedTargets'
  then
    raise exception using
      errcode = '23514',
      message = 'delegation target ceiling does not match its policy snapshot';
  end if;
  if not (delegation_row.allowed_targets @> new.targets) then
    raise exception using
      errcode = '23514',
      message = 'action intent target is outside the Agent delegation';
  end if;

  select s.node_id
    into step_node_id
    from agentic.execution_steps s
   where s.org_id = new.org_id
     and s.workspace_id = new.workspace_id
     and s.user_id = new.user_id
     and s.id = new.step_id
     and s.run_id = new.run_id
     and s.plan_version_id = new.plan_version_id
     and s.assigned_agent_id = new.agent_id
     and s.delegation_id = new.delegation_id;
  if not found then
    raise exception using
      errcode = '23514',
      message = 'action intent step identity mismatch';
  end if;

  select node
    into plan_node
    from jsonb_array_elements(delegation_row.policy_snapshot -> 'nodes') as node
   where node ->> 'nodeId' = step_node_id;
  if not found or plan_node -> 'externalAction' is null or
    plan_node -> 'externalAction' = 'null'::jsonb
  then
    raise exception using
      errcode = '23514',
      message = 'external action is not present in the exact delegation node';
  end if;

  column_action := jsonb_build_object(
    'version', 'orqaly_external_action_spec_v1',
    'effectId', new.effect_id::text,
    'providerOperation', jsonb_build_object(
      'contractVersion', '1.0',
      'operationKey', new.provider_operation_key,
      'operationVersion', new.provider_operation_version,
      'contentHash', new.provider_operation_hash
    ),
    'connection', jsonb_build_object(
      'connectionReference', new.connection_reference,
      'providerKey', new.provider_key,
      'credentialOwnerPrincipalId', new.credential_owner_principal_id,
      'requestedScopes', new.requested_scopes
    ),
    'targets', new.targets,
    'externalPreconditions', new.external_preconditions,
    'idempotency', jsonb_build_object(
      'scope', new.idempotency_scope,
      'key', new.idempotency_key
    ),
    'reconciliation', new.reconciliation_policy,
    'compensation', new.compensation_policy
  );
  snapshot_action := jsonb_build_object(
    'version', 'orqaly_external_action_spec_v1',
    'effectId', new.intent_snapshot -> 'effectId',
    'providerOperation', new.intent_snapshot -> 'providerOperation',
    'connection', new.intent_snapshot -> 'connection',
    'targets', new.intent_snapshot -> 'targets',
    'externalPreconditions', new.intent_snapshot -> 'externalPreconditions',
    'idempotency', new.intent_snapshot -> 'idempotency',
    'reconciliation', new.intent_snapshot -> 'reconciliation',
    'compensation', new.intent_snapshot -> 'compensation'
  );

  if column_action is distinct from snapshot_action or
    column_action is distinct from plan_node -> 'externalAction'
  then
    raise exception using
      errcode = '23514',
      message = 'action intent external authority exceeds or differs from delegation';
  end if;
  if plan_node -> 'descriptor' is distinct from new.intent_snapshot -> 'descriptor' or
    plan_node -> 'executorBinding' is distinct from new.intent_snapshot -> 'executorBinding' or
    plan_node ->> 'canonicalInputHash' is distinct from new.canonical_input_hash or
    plan_node -> 'effectProfile' is distinct from new.effect_profile or
    plan_node -> 'dataEgressProfile' is distinct from new.data_egress_profile
  then
    raise exception using
      errcode = '23514',
      message = 'action intent node authority differs from delegation';
  end if;
  return new;
end;
$$;

create trigger agentic_action_intent_delegation_ceiling
  before insert on agentic.action_intents
  for each row execute function agentic.assert_action_intent_within_delegation();

alter table agentic.agent_delegations
  validate constraint ck_agentic_delegation_target_ceiling_snapshot;
