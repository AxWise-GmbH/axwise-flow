# Suggested Automated Tests for User Ownership

Prevent regression of per-user data isolation and ownership enforcement.

---

## 1. Unit Tests (Backend)

### partnerBackend

- `saveToSupabase` throws "User required" when `supabase.auth.getUser()` returns no user
- `saveToSupabase` includes `user_id` in upsert payload (mock supabase, assert payload)
- `loadFromSupabase` returns only rows where RLS applies (mock: verify no client filter; RLS is server-side)

### meetingBackend

- `insertMeeting` throws "User required" when no authenticated user
- `insertMeeting` includes `user_id` in insert
- `saveToSupabase` throws "User required" when no authenticated user
- `saveToSupabase` includes `user_id` in upsert

### partnerHistoryBackend

- `addEntryToSupabase` throws "User required" when no authenticated user
- `addEntryToSupabase` includes `user_id` in insert

### workflowBackend

- `insertWorkflow` (createWorkflow path) throws "User required" when no authenticated user
- `insertWorkflow` includes `user_id` in insert

---

## 2. Integration Tests (Supabase + Auth)

### Partners

- Authenticated user A creates a partner → row has `user_id` = A
- User B cannot see user A's partners (RLS)
- User B cannot update user A's partners (RLS)
- Unauthenticated request to save partners → 401 / "User required"

### Meetings

- Authenticated user A creates a meeting → row has `user_id` = A
- User B cannot see/update user A's meetings
- `saveMeetings` (bulk) sets `user_id` for all rows

### Partner History

- Authenticated user A adds history entry → row has `user_id` = A
- User B cannot see user A's partner history

### Workflows

- Authenticated user A creates workflow → row has `user_id` = A
- User B cannot see/update/delete user A's workflows

---

## 3. E2E Tests (Cypress / Playwright)

1. **Login → Create Partner → Logout → Login as different user**
   - Second user should not see the first user's partner

2. **Login → Create Meeting → Verify in DB**
   - Meeting row has `user_id` matching authenticated user

3. **Session expired during save**
   - UI should show error ("User required" or 401), not silently fail

---

## 4. Migration Verification

After running `003_user_ownership.sql`:

```sql
-- Verify columns exist
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'partners' AND column_name = 'user_id';
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'partner_history' AND column_name = 'user_id';

-- Verify RLS policies
SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public';

-- List orphaned rows (for manual review)
SELECT 'partners' as tbl, id, user_id FROM public.partners WHERE user_id IS NULL
UNION ALL
SELECT 'partner_history', id::text, user_id FROM public.partner_history WHERE user_id IS NULL
UNION ALL
SELECT 'meetings', id, user_id FROM public.meetings WHERE user_id IS NULL;
```

---

## 5. Regression Checks (CI)

- Run migration on test DB
- Seed test data as user A
- As user B, attempt to SELECT/UPDATE/DELETE user A's data → expect 0 rows or RLS denial
- As user A, create new records → verify `user_id` is set
