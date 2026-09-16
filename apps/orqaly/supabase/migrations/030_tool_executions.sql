-- Tool execution history: tracks every run / test of a connected tool.
create table if not exists public.tool_executions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  tool_id text not null,
  tool_name text,
  connection_type text,
  status text not null default 'pending'
    check (status in ('pending', 'running', 'success', 'failed')),
  request_summary jsonb not null default '{}',
  response_summary jsonb,
  error text,
  duration_ms integer,
  created_at timestamptz default now()
);

create index idx_tool_executions_user on public.tool_executions(user_id);
create index idx_tool_executions_tool on public.tool_executions(tool_id);
create index idx_tool_executions_created on public.tool_executions(created_at desc);
alter table public.tool_executions enable row level security;

create policy "Users manage own tool executions"
  on public.tool_executions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
