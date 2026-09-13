-- Workflows: visible to all authenticated users; only owner can insert/update/delete.
--
-- SUPERSEDED by 184_data_isolation_rls.sql — workflows are now owner-only, so the
-- share-all read below is dropped. Kept for history; do not re-run.
--
-- Note: this file used to name a specific user as the reason for the share-all
-- read. That account has never existed in the current project. The policies here
-- granted access to EVERY authenticated user, not to that one person — which is
-- exactly why it had to go.

drop policy if exists "Users can manage own workflows" on public.workflows;

-- All authenticated users can view all workflows
create policy "Users can view all workflows"
  on public.workflows for select
  using (auth.uid() is not null);

-- Only owner can insert (must set user_id to self)
create policy "Users can insert own workflows"
  on public.workflows for insert
  with check (user_id = auth.uid());

-- Only owner can update
create policy "Users can update own workflows"
  on public.workflows for update
  using (user_id = auth.uid());

-- Only owner can delete
create policy "Users can delete own workflows"
  on public.workflows for delete
  using (user_id = auth.uid());
