alter table agentic.agents
  alter column source_task_id drop not null,
  add column workflow_run_id uuid,
  add column created_from text not null default 'task'
    check (created_from in ('manual', 'task')),
  add column current_profile_version_id uuid;

-- Older task-materialized temporary Agents had an open-ended lifetime. Give them the same
-- bounded preview lifetime as newly created temporary Agents before tightening the invariant.
update agentic.agents
   set expires_at = created_at + interval '90 days'
 where agent_kind = 'temporary' and expires_at is null;

alter table agentic.agents
  drop constraint ck_agentic_agents_expiry,
  add constraint ck_agentic_agents_expiry check (
    (agent_kind = 'persistent' and expires_at is null)
    or (agent_kind = 'temporary' and expires_at is not null)
  );

create table agentic.agent_profile_versions (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  agent_id uuid not null,
  version_number integer not null check (version_number > 0),
  display_name text not null check (char_length(display_name) between 1 and 160),
  role_label text not null check (char_length(role_label) between 1 and 160),
  description text not null default '' check (char_length(description) <= 2000),
  instructions text not null default '' check (char_length(instructions) <= 12000),
  avatar_kind text not null check (avatar_kind in ('icon', 'emoji')),
  avatar_value text not null check (char_length(avatar_value) between 1 and 32),
  avatar_color text not null check (avatar_color ~ '^#[0-9A-F]{6}$'),
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  created_by text not null,
  created_at timestamptz not null default now(),
  constraint uq_agentic_profile_tenant unique (org_id, workspace_id, user_id, id),
  constraint uq_agentic_profile_agent_identity unique (
    org_id, workspace_id, user_id, agent_id, id
  ),
  constraint uq_agentic_profile_version unique (
    org_id, workspace_id, user_id, agent_id, version_number
  ),
  constraint fk_agentic_profile_agent foreign key (
    org_id, workspace_id, user_id, agent_id
  ) references agentic.agents (
    org_id, workspace_id, user_id, id
  ),
  constraint ck_agentic_profile_avatar_value check (
    (avatar_kind = 'icon' and avatar_value in (
      'smart_toy', 'bolt', 'science', 'support_agent', 'campaign', 'code'
    ))
    or (avatar_kind = 'emoji' and avatar_value !~ '[[:cntrl:]]')
  )
);

create index ix_agentic_profiles_agent
  on agentic.agent_profile_versions (
    org_id, workspace_id, user_id, agent_id, version_number desc
  );

create index ix_agentic_profiles_hash
  on agentic.agent_profile_versions (
    org_id, workspace_id, user_id, agent_id, content_hash
  );

-- Existing task-materialized Agents receive a neutral user-facing profile.
-- Their AxWise execution persona remains untouched in agent_persona_versions.
insert into agentic.agent_profile_versions (
  org_id, workspace_id, user_id, agent_id, version_number,
  display_name, role_label, description, instructions,
  avatar_kind, avatar_value, avatar_color, content_hash, created_by, created_at
)
select
  a.org_id,
  a.workspace_id,
  a.user_id,
  a.id,
  1,
  left(a.display_name, 160),
  left(coalesce(nullif(persona.manifest ->> 'role', ''), 'Task executor'), 160),
  left(coalesce(persona.manifest ->> 'mission', ''), 2000),
  left(coalesce(persona.manifest ->> 'mission', ''), 12000),
  'icon',
  'smart_toy',
  '#6750A4',
  encode(
    sha256(
      convert_to(
        '{"avatar":{"color":"#6750A4","kind":"icon","value":"smart_toy"},' ||
        '"description":' || to_jsonb(left(coalesce(persona.manifest ->> 'mission', ''), 2000))::text || ',' ||
        '"displayName":' || to_jsonb(left(a.display_name, 160))::text || ',' ||
        '"instructions":' || to_jsonb(left(coalesce(persona.manifest ->> 'mission', ''), 12000))::text || ',' ||
        '"roleLabel":' || to_jsonb(
          left(coalesce(nullif(persona.manifest ->> 'role', ''), 'Task executor'), 160)
        )::text || ',' ||
        '"version":"orqaly_agent_profile_input_v1"}',
        'UTF8'
      )
    ),
    'hex'
  ),
  a.user_id,
  a.created_at
from agentic.agents a
left join lateral (
  select p.manifest
    from agentic.agent_persona_versions p
   where p.org_id = a.org_id
     and p.workspace_id = a.workspace_id
     and p.user_id = a.user_id
     and p.agent_id = a.id
   order by p.version_number desc
   limit 1
) persona on true;

update agentic.agents a
   set current_profile_version_id = profile.id
  from agentic.agent_profile_versions profile
 where profile.org_id = a.org_id
   and profile.workspace_id = a.workspace_id
   and profile.user_id = a.user_id
   and profile.agent_id = a.id
   and profile.version_number = 1;

alter table agentic.agents
  add constraint fk_agentic_agent_current_profile foreign key (
    org_id, workspace_id, user_id, id, current_profile_version_id
  ) references agentic.agent_profile_versions (
    org_id, workspace_id, user_id, agent_id, id
  );

create table agentic.agent_mutation_requests (
  id uuid primary key default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  operation text not null check (
    operation in ('create', 'profile_update', 'lifecycle')
  ),
  agent_id uuid,
  idempotency_key text not null check (char_length(idempotency_key) between 1 and 200),
  request_hash text not null check (request_hash ~ '^[a-f0-9]{64}$'),
  state text not null default 'in_progress'
    check (state in ('in_progress', 'completed')),
  response_payload jsonb check (
    response_payload is null or jsonb_typeof(response_payload) = 'object'
  ),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint uq_agentic_agent_mutation_tenant unique (
    org_id, workspace_id, user_id, id
  ),
  constraint uq_agentic_agent_mutation_key unique (
    org_id, workspace_id, user_id, idempotency_key
  ),
  constraint fk_agentic_agent_mutation_agent foreign key (
    org_id, workspace_id, user_id, agent_id
  ) references agentic.agents (
    org_id, workspace_id, user_id, id
  ),
  constraint ck_agentic_agent_mutation_target check (
    (operation = 'create' and agent_id is null)
    or (operation in ('profile_update', 'lifecycle') and agent_id is not null)
  ),
  constraint ck_agentic_agent_mutation_completion check (
    (state = 'in_progress' and response_payload is null and completed_at is null)
    or (state = 'completed' and response_payload is not null and completed_at is not null)
  )
);

create index ix_agentic_agent_mutations_created
  on agentic.agent_mutation_requests (
    org_id, workspace_id, user_id, created_at desc
  );

create table agentic.agent_events (
  sequence_id bigint generated always as identity primary key,
  id uuid not null default gen_random_uuid(),
  org_id text not null,
  workspace_id text not null,
  user_id text not null,
  agent_id uuid not null,
  event_type text not null check (
    event_type in ('agent.created', 'agent.profile_updated', 'agent.lifecycle_changed')
  ),
  actor_type text not null check (actor_type in ('human', 'service', 'system')),
  safe_payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(safe_payload) = 'object'),
  correlation_id text not null check (char_length(correlation_id) between 1 and 200),
  created_at timestamptz not null default now(),
  constraint uq_agentic_agent_event_tenant unique (
    org_id, workspace_id, user_id, id
  ),
  constraint fk_agentic_agent_event_agent foreign key (
    org_id, workspace_id, user_id, agent_id
  ) references agentic.agents (
    org_id, workspace_id, user_id, id
  )
);

create index ix_agentic_agent_events_cursor
  on agentic.agent_events (
    org_id, workspace_id, user_id, agent_id, sequence_id
  );

create trigger agentic_profile_immutable
  before update or delete on agentic.agent_profile_versions
  for each row execute function agentic.reject_immutable_change();

create trigger agentic_agent_event_immutable
  before update or delete on agentic.agent_events
  for each row execute function agentic.reject_immutable_change();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'agent_profile_versions',
    'agent_mutation_requests',
    'agent_events'
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
