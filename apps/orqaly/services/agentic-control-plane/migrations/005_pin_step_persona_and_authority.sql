alter table agentic.agent_persona_versions
  add constraint uq_agentic_persona_execution_binding unique (
    org_id, workspace_id, user_id, id, agent_id,
    persona_id, content_hash, version_number
  );

alter table agentic.execution_steps
  add column persona_version_id uuid,
  add column persona_contract_version text,
  add column persona_id text,
  add column persona_version_number integer,
  add column persona_content_hash text;

alter table agentic.execution_steps
  add constraint ck_agentic_step_persona_required check (
    persona_version_id is not null
    and persona_contract_version = '1.0'
    and persona_id is not null
    and persona_version_number > 0
    and persona_content_hash ~ '^[a-f0-9]{64}$'
  ) not valid,
  add constraint fk_agentic_step_exact_persona foreign key (
    org_id, workspace_id, user_id, persona_version_id, assigned_agent_id,
    persona_id, persona_content_hash, persona_version_number
  ) references agentic.agent_persona_versions (
    org_id, workspace_id, user_id, id, agent_id,
    persona_id, content_hash, version_number
  ) not valid;

create index ix_agentic_steps_persona
  on agentic.execution_steps (
    org_id, workspace_id, user_id, persona_version_id, state
  );

create or replace function agentic.reject_step_authority_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.run_id,
    new.plan_version_id,
    new.node_id,
    new.descriptor_key,
    new.descriptor_version,
    new.descriptor_hash,
    new.executor_binding_key,
    new.executor_binding_version,
    new.executor_binding_hash,
    new.effect_profile,
    new.data_egress_profile,
    new.assigned_agent_id,
    new.persona_version_id,
    new.persona_contract_version,
    new.persona_id,
    new.persona_version_number,
    new.persona_content_hash,
    new.input_hash,
    new.delegation_id
  ) is distinct from row(
    old.run_id,
    old.plan_version_id,
    old.node_id,
    old.descriptor_key,
    old.descriptor_version,
    old.descriptor_hash,
    old.executor_binding_key,
    old.executor_binding_version,
    old.executor_binding_hash,
    old.effect_profile,
    old.data_egress_profile,
    old.assigned_agent_id,
    old.persona_version_id,
    old.persona_contract_version,
    old.persona_id,
    old.persona_version_number,
    old.persona_content_hash,
    old.input_hash,
    old.delegation_id
  ) then
    raise exception using
      errcode = '55000',
      message = 'execution step authority is immutable';
  end if;
  return new;
end;
$$;

create trigger agentic_step_authority_immutable
  before update on agentic.execution_steps
  for each row execute function agentic.reject_step_authority_change();
