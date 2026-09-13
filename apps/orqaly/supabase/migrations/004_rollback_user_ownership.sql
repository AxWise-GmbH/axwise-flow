-- Rollback for 003_user_ownership.sql
-- Run only if you need to revert the user ownership migration.
-- WARNING: This drops per-user RLS and removes user_id columns.

-- Restore broad RLS policies
DROP POLICY IF EXISTS "Users can manage own partners" ON public.partners;
DROP POLICY IF EXISTS "Users can manage own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Users can manage own workflows" ON public.workflows;
DROP POLICY IF EXISTS "Users can manage own partner_history" ON public.partner_history;

CREATE POLICY "Users can manage partners" ON public.partners
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage meetings" ON public.meetings
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage workflows" ON public.workflows
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Users can manage partner_history" ON public.partner_history
  FOR ALL USING (auth.role() = 'authenticated');

-- Remove user_id columns (optional; uncomment if desired)
-- ALTER TABLE public.partners DROP COLUMN IF EXISTS user_id;
-- ALTER TABLE public.partner_history DROP COLUMN IF EXISTS user_id;
-- DROP INDEX IF EXISTS idx_partners_user_id;
-- DROP INDEX IF EXISTS idx_partner_history_user_id;
