-- Give browser-seeded catalogue agents one durable identity per user. Older
-- rows carry random metadata.agent_id values and remain available as history;
-- new code upgrades the logical survivor to a stable `predefined:<role>` key.
-- This partial unique index prevents concurrent/fresh browser sessions from
-- inserting the same predefined agent twice without restricting user-created
-- agents that intentionally share a display role.

create unique index if not exists idx_agents_predefined_identity_unique
  on public.agents (user_id, (metadata ->> 'agent_id'))
  where status = 'active'
    and (metadata ->> 'agent_id') like 'predefined:%';

comment on index public.idx_agents_predefined_identity_unique is
  'One active browser-seeded catalogue agent per stable predefined identity and user.';
