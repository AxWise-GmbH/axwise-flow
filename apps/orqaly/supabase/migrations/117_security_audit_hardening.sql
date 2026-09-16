-- 117_security_audit_hardening.sql
-- Tighten audit_log SELECT for SECURITY_* events only, preserving
-- site-wide visibility of non-security rows (existing Audit Log page).
--
-- Two permissive policies UNION: any auth'd user sees non-security rows,
-- AND owners additionally see their own rows (including SECURITY_*).
-- Result: no one sees ANOTHER user's SECURITY_* events.

drop policy if exists "Authenticated users can read audit_log" on public.audit_log;
drop policy if exists "Users read own audit_log" on public.audit_log;
drop policy if exists "Auth users read non-security audit_log" on public.audit_log;

create policy "Auth users read non-security audit_log"
  on public.audit_log for select
  using (auth.role() = 'authenticated' and action not like 'SECURITY_%');

create policy "Users read own audit_log"
  on public.audit_log for select
  using (auth.uid() = user_id);

-- Partial index for security-event dashboards
create index if not exists idx_audit_log_security
  on public.audit_log(created_at desc)
  where action like 'SECURITY_%';
