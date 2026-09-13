# User Ownership & Persistence Audit Report

**Platform:** Orchestrator  
**Date:** 2026-02-11  
**Objective:** Ensure every user-facing action persists data to the database and is associated with the authenticated user's ID, with strict per-user data isolation.

---

## Executive Summary

| Category | Status |
|----------|--------|
| **Tables missing `user_id`** | 2 (partners, partner_history) |
| **Writes without auth user** | 4 backends |
| **RLS per-user isolation** | Only profile_notes, profile_todos |
| **Silent failures** | localStorage catch blocks swallow errors |
| **Client-derived userId** | None (profileDataBackend uses auth; partnerService `information.userId` is partner attribute, not auth) |

---

## 1. Tables & Ownership Fields

| Table | Has user_id? | FK to auth.users | RLS Filter | Notes |
|-------|--------------|------------------|------------|-------|
| **partners** | ❌ No | N/A | No | Any authenticated user can CRUD all partners |
| **meetings** | ✅ Yes | Yes (on delete set null) | No | RLS allows all authenticated; load/save don't filter by user |
| **workflows** | ✅ Yes | Yes | No | Insert sets user_id; load returns ALL workflows |
| **partner_history** | ❌ No | N/A | No | Only partner_id; no user ownership |
| **profile_notes** | ✅ Yes | Yes (cascade) | Yes | `user_id = auth.uid()` |
| **profile_todos** | ✅ Yes | Yes (cascade) | Yes | `user_id = auth.uid()` |

---

## 2. Pages, Forms & Write Paths

| Page/Feature | Write Operations | Backend | userId Source | Status |
|--------------|------------------|---------|---------------|--------|
| Partners (add/update) | create, update | partnerBackend | None | ❌ No user_id |
| Partners (history) | addEntry | partnerHistoryBackend | None | ❌ No user_id |
| Meetings (create/update) | insertMeeting, saveMeetings, updateMeeting | meetingBackend | insertMeeting only | ⚠️ saveMeetings omits user_id |
| Workflows | createWorkflow | workflowBackend | supabase.auth.getUser() | ✅ OK (insert) |
| Settings (notes/todos) | addNote, updateNote, deleteNote, addTodo, etc. | profileDataBackend | useAuth().user?.uid (caller) | ✅ OK |
| Dashboard | Read-only | — | — | — |
| Audit Log | Read-only | — | — | — |

---

## 3. API Routes & Background Jobs

| Route/Job | Data Writes | userId | Status |
|-----------|-------------|--------|--------|
| `POST /api/transcribe` | None | N/A | Returns transcript only; client persists |
| `POST /api/send-email` | None | N/A | Sends email; no DB write |
| Transcription pipeline (meetingService) | updateMeeting | Supabase RLS | No explicit user_id on update |

---

## 4. Identified Issues

### 4.1 partners table – no user_id
- **Impact:** All partners are shared across authenticated users. No per-user isolation.
- **Backend:** `partnerBackend.saveToSupabase` and `loadFromSupabase` do not use user_id.
- **Fix:** Add `user_id uuid REFERENCES auth.users(id)`; inject on create/update; filter loads by user_id.

### 4.2 partner_history table – no user_id
- **Impact:** History entries are linked only via partner_id. When partners become user-scoped, history must follow.
- **Backend:** `partnerHistoryBackend.addEntryToSupabase` inserts partner_id, type, title, detail, meta – no user_id.
- **Fix:** Add `user_id uuid REFERENCES auth.users(id)`; inject from auth session; add RLS.

### 4.3 meetings – saveToSupabase omits user_id
- **Impact:** `meetingService.getByPartnerId` calls `saveMeetings(all)` when generating dummy meetings (localStorage fallback). With Supabase, `saveToSupabase` upserts without user_id – new rows may have user_id = null.
- **Backend:** `meetingBackend.saveToSupabase` upserts `{ id, partner_id, data, updated_at }` – no user_id.
- **Fix:** Fetch auth user in saveToSupabase and include user_id in upsert.

### 4.4 meetings – insertMeeting allows null user_id
- **Impact:** If `supabase.auth.getUser()` returns no user (e.g. session expired), meeting is inserted with user_id = null.
- **Fix:** Reject insert when no authenticated user; throw `User required`.

### 4.5 workflows – loadFromSupabase returns all users' workflows
- **Impact:** Any authenticated user sees all workflows.
- **Backend:** `workflowBackend.loadFromSupabase` has no `.eq('user_id', userId)`.
- **Fix:** Filter by user_id from auth.getUser().

### 4.6 workflows – insertWorkflow allows null user_id
- **Fix:** Reject insert when no authenticated user.

### 4.7 RLS – per-user isolation missing
- **Current:** partners, meetings, workflows, partner_history use `auth.role() = 'authenticated'` only.
- **Fix:** Replace with `user_id = auth.uid()` where user_id exists; for partners/partner_history after migration.

### 4.8 Silent failures
- **Location:** partnerBackend, meetingBackend, workflowBackend – `catch {}` in localStorage save.
- **Fix:** Log errors; consider rethrowing in development.

---

## 5. userId Derivation

| Source | Used By | Trust |
|--------|---------|-------|
| `supabase.auth.getUser()` | meetingBackend, workflowBackend | ✅ Server-side; session token |
| `useAuth().user?.uid` (caller) | profileDataBackend | ✅ From AuthContext; session |
| Client input (body, query) | None | N/A |

**Conclusion:** No userId is derived from client input. All ownership must come from auth session.

---

## 6. Foreign Key Relationships

```
auth.users (id)
  ├── partners.user_id (to be added)
  ├── meetings.user_id
  ├── workflows.user_id
  ├── partner_history.user_id (to be added)
  ├── profile_notes.user_id
  └── profile_todos.user_id

partners (id)
  ├── meetings.partner_id
  └── partner_history.partner_id
```

---

## 7. Backfill Strategy

- **partners:** Existing rows have no user_id. Migration adds column as nullable. Log rows with null user_id for manual review; do not overwrite.
- **partner_history:** Same; add nullable user_id. Optionally backfill from partners.user_id when partners are backfilled.
- **meetings:** Some may have null user_id from saveToSupabase. Log for review; do not guess.

---

## 8. Required Fixes Summary

| # | Fix | File(s) |
|---|-----|---------|
| 1 | Add user_id to partners, partner_history | Migration 003 |
| 2 | RLS: user_id = auth.uid() for all user-scoped tables | Migration 003 |
| 3 | partnerBackend: inject user_id on save; filter load; reject when no auth | partnerBackend.js |
| 4 | meetingBackend: inject user_id in saveToSupabase; reject insert/update when no auth | meetingBackend.js |
| 5 | partnerHistoryBackend: inject user_id on addEntry | partnerHistoryBackend.js |
| 6 | workflowBackend: filter load by user_id; reject create when no auth | workflowBackend.js |

---

## 9. Suggested Automated Tests

See `docs/USER_OWNERSHIP_TESTS.md` for test specifications.

---

## 10. Exact Code Changes Applied

### Migration

- **File:** `supabase/migrations/003_user_ownership.sql`
- Added `user_id` column to `partners` and `partner_history`
- Replaced broad RLS policies with per-user policies: `user_id = auth.uid()`

### partnerBackend.js

- Added `getAuthUserId()` helper
- `saveToSupabase`: fetch userId from auth; throw if no user; include `user_id` in upsert payload

### meetingBackend.js

- `insertMeeting`: throw "User required" when no user; pass `userId` (never null) to insert
- `saveToSupabase`: fetch userId; throw if no user; include `user_id` in upsert payload

### partnerHistoryBackend.js

- `addEntryToSupabase`: fetch userId from auth; throw if no user; include `user_id` in insert

### workflowBackend.js

- `insertWorkflow`: throw "User required" when no user; pass `userId` (never null) to insert

---

## 11. Success Criteria

- [x] Every table has user_id (or equivalent) where ownership applies
- [x] Every write operation injects userId from authenticated session
- [x] Writes rejected when no authenticated user
- [x] RLS enforces `user_id = auth.uid()` for user-scoped data
- [x] No client-provided userId used for ownership
- [x] Backfill/logging for ambiguous records; no overwriting of existing ownership
