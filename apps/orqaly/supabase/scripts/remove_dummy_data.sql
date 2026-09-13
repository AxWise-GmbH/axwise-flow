-- Remove dummy data from production
-- Run in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- Run each section separately and check row counts if you want to preview first.

-- ---------------------------------------------------------------------------
-- 1. DUMMY MEETINGS
-- Dummy meetings have ids like: MTG-P-001-01, MTG-P-001-02, MTG-P-002-01, ...
-- (pattern: MTG-{partnerId}-01 through 04)
-- ---------------------------------------------------------------------------

-- Preview: see which meetings would be deleted (optional)
-- SELECT id, partner_id, created_at FROM public.meetings
-- WHERE id ~ '^MTG-.+-0[1-4]$';

-- Delete dummy meetings
DELETE FROM public.meetings
WHERE id ~ '^MTG-.+-0[1-4]$';


-- ---------------------------------------------------------------------------
-- 2. SEED PARTNER HISTORY (optional – use only if you seeded and want to remove)
-- These match the exact seed titles/detail we used. Real entries with the
-- same text would also be deleted; run the SELECT first to confirm.
-- ---------------------------------------------------------------------------

-- Preview: see which history rows match seed content (optional)
-- SELECT id, partner_id, type, title, detail, created_at FROM public.partner_history
-- WHERE (type = 'conversation' AND detail = 'Operator: Andrew Vance')
--    OR (type = 'file' AND title = 'File has been uploaded' AND detail = 'Added by: Lora Adams')
--    OR (type = 'interaction' AND detail = 'source Christmas Promotion Website · Triggered by: John Lock')
--    OR (type = 'note' AND title = 'Follow-up call scheduled' AND detail = 'Added by: Andrew Vance')
--    OR (type = 'reminder' AND title = 'Contract renewal due' AND detail = 'Reminder set by: Lora Adams')
--    OR (type = 'rating' AND title = 'Quality score updated' AND detail = 'Score: 4.5/5');

-- Delete seed partner history (uncomment to run)
-- DELETE FROM public.partner_history
-- WHERE (type = 'conversation' AND detail = 'Operator: Andrew Vance')
--    OR (type = 'file' AND title = 'File has been uploaded' AND detail = 'Added by: Lora Adams')
--    OR (type = 'interaction' AND detail = 'source Christmas Promotion Website · Triggered by: John Lock')
--    OR (type = 'note' AND title = 'Follow-up call scheduled' AND detail = 'Added by: Andrew Vance')
--    OR (type = 'reminder' AND title = 'Contract renewal due' AND detail = 'Reminder set by: Lora Adams')
--    OR (type = 'rating' AND title = 'Quality score updated' AND detail = 'Score: 4.5/5');
