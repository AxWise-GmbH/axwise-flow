-- Bulk RLS policy fix: replace overly permissive auth.role() = 'authenticated'
-- policies with properly scoped policies (user_id = auth.uid() or service_role-only writes).
-- This prevents cross-user data access across the platform.

-- ============================================================
-- 1. user_roles — prevent self-escalation to Super Admin
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage user_roles" ON public.user_roles;
DROP POLICY IF EXISTS "Authenticated users can read user_roles" ON public.user_roles;

-- Users can only read their own role assignment
CREATE POLICY "Users read own role" ON public.user_roles
  FOR SELECT USING (user_id = auth.uid());

-- Only service_role (backend API) can insert/update/delete roles
CREATE POLICY "Service role manages user_roles" ON public.user_roles
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 2. roles — read-only for users, writes via service_role only
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage roles" ON public.roles;
DROP POLICY IF EXISTS "Authenticated users can read roles" ON public.roles;

CREATE POLICY "Authenticated users read roles" ON public.roles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages roles" ON public.roles
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 3. github_pushes — scope to owner
-- ============================================================
DROP POLICY IF EXISTS "Users can manage github_pushes" ON public.github_pushes;

CREATE POLICY "Users manage own github_pushes" ON public.github_pushes
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ============================================================
-- 4. github_push_tasks — scope via parent github_pushes
-- ============================================================
DROP POLICY IF EXISTS "Users can manage github_push_tasks" ON public.github_push_tasks;

CREATE POLICY "Users manage own github_push_tasks" ON public.github_push_tasks
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.github_pushes gp
    WHERE gp.id = push_id AND gp.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.github_pushes gp
    WHERE gp.id = push_id AND gp.user_id = auth.uid()
  ));

-- ============================================================
-- 5. report_snapshots — scope to owner
-- ============================================================
-- Migration 062 originally added this column later, but the owner policy below
-- already depends on it. Add it here as well so a fresh bootstrap is ordered
-- correctly; 062 remains an idempotent compatibility migration.
ALTER TABLE public.report_snapshots
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS idx_report_snapshots_user
  ON public.report_snapshots(user_id);

DROP POLICY IF EXISTS "Users can manage report_snapshots" ON public.report_snapshots;

CREATE POLICY "Users manage own report_snapshots" ON public.report_snapshots
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Allow service_role to insert snapshots (used by reports handler)
CREATE POLICY "Service role manages report_snapshots" ON public.report_snapshots
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 6. system_agents — read-only for users, writes via service_role
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can manage system_agents" ON public.system_agents;
DROP POLICY IF EXISTS "Users can manage system_agents" ON public.system_agents;

CREATE POLICY "Authenticated users read system_agents" ON public.system_agents
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages system_agents" ON public.system_agents
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 7. jobs — scope to owner
-- ============================================================
DROP POLICY IF EXISTS "Users can manage jobs" ON public.jobs;

CREATE POLICY "Users manage own jobs" ON public.jobs
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role needs access for job processing
CREATE POLICY "Service role manages jobs" ON public.jobs
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 8. concilium — scope to owner
-- ============================================================
DROP POLICY IF EXISTS "Users can manage concilium" ON public.concilium;

CREATE POLICY "Users manage own concilium" ON public.concilium
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Service role manages concilium" ON public.concilium
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 9. audit_log — constrain INSERT to own user_id
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can insert audit_log" ON public.audit_log;
DROP POLICY IF EXISTS "Authenticated users can read audit_log" ON public.audit_log;

-- Users can read their own audit entries
CREATE POLICY "Users read own audit_log" ON public.audit_log
  FOR SELECT USING (user_id = auth.uid());

-- Users can only insert entries with their own user_id
CREATE POLICY "Users insert own audit_log" ON public.audit_log
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Service role can read/write all (for admin views)
CREATE POLICY "Service role manages audit_log" ON public.audit_log
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ============================================================
-- 10. feature_flags — read-only for users
-- ============================================================
DROP POLICY IF EXISTS "Authenticated users can read feature_flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Authenticated users read feature_flags" ON public.feature_flags;
DROP POLICY IF EXISTS "Service role manages feature_flags" ON public.feature_flags;

CREATE POLICY "Authenticated users read feature_flags" ON public.feature_flags
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role manages feature_flags" ON public.feature_flags
  FOR ALL USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
