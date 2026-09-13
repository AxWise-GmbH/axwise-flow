-- Add 'composio' to tools.connection_type check constraint
-- Required for MCP tool integrations via Composio

alter table public.tools drop constraint if exists tools_connection_type_check;

alter table public.tools add constraint tools_connection_type_check
  check (connection_type in ('api', 'internal', 'webhook', 'sdk', 'composio'));
