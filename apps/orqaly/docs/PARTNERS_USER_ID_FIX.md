# partners.user_id Column Error – Issue List & Fix

## Root Cause

The `partners` table in **001_initial_schema.sql** does **not** include a `user_id` column. Migration **003_user_ownership.sql** adds it, but if 003 hasn’t been run, any reference to `partners.user_id` will fail.

## Issues

1. **partnerBackend.js – `loadFromSupabase`**
   - Selects `user_id` from `partners`.
   - Fails with: `column partners.user_id does not exist`.

2. **partnerBackend.js – `saveToSupabase`**
   - Includes `user_id` in the upsert payload.
   - Fails with: `column partners.user_id does not exist`.

3. **Dashboard, Partners, Task Manager**
   - All depend on `loadPartners` → `loadFromSupabase`.
   - Cascade into: "Failed to load", "Failed to load partners", "Failed to load tasks".

## Fix

Update `partnerBackend.js` so it works with the base schema (001) that has no `user_id`:

1. Remove `user_id` from the `loadFromSupabase` select.
2. Remove `user_id` from the `saveToSupabase` upsert payload.

## Optional: Add user_id Later

To enable user ownership, run migration **003_user_ownership.sql** in the Supabase SQL Editor. Then you can reintroduce `user_id` in the select and upsert.
