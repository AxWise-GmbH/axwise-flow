-- Tighten projects ownership to per-user isolation.
-- Run after 006_projects.sql.

-- Ensure lookup performance for scoped queries.
create index if not exists idx_projects_user_id on public.projects(user_id);

-- Replace broad policy with per-user ownership.
drop policy if exists "Users can manage projects" on public.projects;
drop policy if exists "Users can manage own projects" on public.projects;

create policy "Users can manage own projects" on public.projects
  for all using (user_id = auth.uid());
