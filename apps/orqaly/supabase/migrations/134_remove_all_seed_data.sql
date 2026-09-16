-- 134_remove_all_seed_data.sql
-- One-shot cleanup: remove every row that was inserted by the development
-- seed fixtures (supabase/seed.sql, supabase/seed-test.sql, the legacy
-- supabase/scripts/seed_dev.sql template, and the dummy-meeting generator
-- that supabase/scripts/remove_dummy_data.sql targeted).
--
-- These fixtures contaminated production-style environments with rows owned
-- by accounts that do not exist (e.g. partner-acme-corp), inflating
-- dashboard counts and making it impossible to verify the five product
-- surfaces (KB, Tasks, Projects, Reports, Communicator) show real data.
--
-- After this migration runs, the corresponding seed files are also removed
-- from the repository so they cannot be replayed.
--
-- Each delete is guarded with EXISTS checks against an explicit id list or
-- regex, so re-running this migration is a no-op.

begin;

-- ── Fixed-UUID seed rows from supabase/seed.sql and seed-test.sql ──────

delete from public.notifications
 where id::text in ('notif-seed-001', 'notif-seed-002', 'notif-seed-003');

delete from public.agent_hub_tasks
 where id::text like 'd0000000-0000-0000-0000-%'
    or id::text like 'd9000000-0000-0000-0000-%';

delete from public.agent_hub_projects
 where id::text like 'c0000000-0000-0000-0000-%'
    or id::text like 'c9000000-0000-0000-0000-%';

delete from public.agent_hub_agents
 where id::text like 'b0000000-0000-0000-0000-%'
    or id::text like 'b9000000-0000-0000-0000-%';

delete from public.payouts
 where id::text like 'f0000000-0000-0000-0000-%';

delete from public.audit_log
 where id::text like 'e0000000-0000-0000-0000-%'
    or id::text like 'e9000000-0000-0000-0000-%';

delete from public.partners
 where id::text in ('partner-acme-corp', 'partner-beta-agency', 'test-partner-minimal');

-- ── Dummy meetings created by older fixtures (MTG-<partnerId>-01..04) ──
-- Same pattern as supabase/scripts/remove_dummy_data.sql, but now part of
-- the canonical migration timeline instead of an out-of-band script.

delete from public.meetings
 where id::text ~ '^MTG-.+-0[1-4]$';

commit;
