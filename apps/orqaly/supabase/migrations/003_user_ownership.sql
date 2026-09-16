-- User Ownership Migration
-- Adds user_id to partners and partner_history; tightens RLS for per-user isolation.
-- Run in Supabase SQL Editor. Existing rows with null user_id will be HIDDEN until backfilled.
-- Log and manually assign ownership for orphaned records before tightening RLS if needed.

-- 1. Add user_id to partners
alter table public.partners
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_partners_user_id on public.partners(user_id);

comment on column public.partners.user_id is 'Owner. Null = orphaned (pre-migration). RLS hides rows where user_id != auth.uid().';

-- 2. Add user_id to partner_history
alter table public.partner_history
  add column if not exists user_id uuid references auth.users(id) on delete set null;

create index if not exists idx_partner_history_user_id on public.partner_history(user_id);

comment on column public.partner_history.user_id is 'Owner. Null = orphaned. RLS hides rows where user_id != auth.uid().';

-- 3. Drop old broad RLS policies
drop policy if exists "Users can manage partners" on public.partners;
drop policy if exists "Users can manage meetings" on public.meetings;
drop policy if exists "Users can manage workflows" on public.workflows;
drop policy if exists "Users can manage partner_history" on public.partner_history;

-- 4. Partners: per-user isolation (null user_id rows hidden until backfilled)
create policy "Users can manage own partners" on public.partners
  for all using (user_id = auth.uid());

-- 5. Meetings: per-user isolation
create policy "Users can manage own meetings" on public.meetings
  for all using (user_id = auth.uid());

-- 6. Workflows: per-user isolation
create policy "Users can manage own workflows" on public.workflows
  for all using (user_id = auth.uid());

-- 7. Partner history: per-user isolation
create policy "Users can manage own partner_history" on public.partner_history
  for all using (user_id = auth.uid());

-- Optional: list orphaned rows for manual review (run separately)
-- SELECT id, data->>'name' as name, created_at FROM public.partners WHERE user_id IS NULL;
-- SELECT id, partner_id, type, title, created_at FROM public.partner_history WHERE user_id IS NULL;
-- SELECT id, partner_id, data->>'datetime' as datetime FROM public.meetings WHERE user_id IS NULL;
